import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import OpenAI from 'openai';

const STANDARD_ENGINEERING_TASKS = ['PR Review', 'Dev Testing', 'QA Handoff'];

async function fetchAdoItemDetail(projectId: string, itemId: string, supabase: any) {
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('project_id', projectId)
    .eq('type', 'azure_devops')
    .eq('is_active', true)
    .maybeSingle();
  const { data: secret } = await supabase
    .from('secrets')
    .select('*')
    .eq('project_id', projectId)
    .eq('provider', 'azure_devops')
    .maybeSingle();
  if (!integration || !secret) throw new Error('ADO integration/secret missing');

  let patRaw: string = secret.encrypted_value;
  if (process.env.APP_ENCRYPTION_KEY) {
    const { decryptString } = await import('@/../lib/crypto');
    patRaw = decryptString(patRaw);
  }
  const creds = typeof patRaw === 'string' ? JSON.parse(patRaw) : patRaw;
  const organization = (integration.metadata as any)?.organization || creds.organization;
  const project = (integration.metadata as any)?.project || creds.project;
  const pat = creds.personalAccessToken;
  const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
  const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workitems/${encodeURIComponent(itemId)}?api-version=7.1`;
  const resp = await fetch(url, { headers: { Authorization: authHeader, Accept: 'application/json', 'X-TFS-FedAuthRedirect': 'Suppress', 'User-Agent': 'ThriveIQ/1.0' } });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`ADO error: ${resp.status} ${txt.slice(0,200)}`);
  const json: any = JSON.parse(txt);
  const f = json.fields || {};
  return {
    id: json.id,
    title: f['System.Title'] || '',
    descriptionHtml: (f['System.Description'] || '').toString(),
    acceptanceCriteriaHtml: (f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').toString(),
  };
}

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const itemIds: string[] = body.itemIds || [];
  const templateId: string | undefined = body.templateId;
  const contextIds: string[] = body.contextIds || [];
  if (!itemIds.length) return NextResponse.json({ message: 'itemIds required' }, { status: 400 });

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  // Create run
  const { data: run, error: runErr } = await supabase
    .from('runs')
    .insert({
      user_id: user.id,
      project_id: params.projectId,
      template_id: templateId ?? null,
      provider: 'openai',
      model: 'gpt-4o',
      status: 'pending',
      context_refs: { itemIds, contextIds },
    })
    .select()
    .single();
  if (runErr) return NextResponse.json({ message: runErr.message }, { status: 500 });

  // Create run_items with beforeJson snapshot
  for (const id of itemIds) {
    try {
      const before = await fetchAdoItemDetail(params.projectId, String(id), supabase);
      await supabase.from('run_items').insert({ run_id: run.id, source_item_id: String(id), before_json: before });
    } catch (e) {
      await supabase.from('run_items').insert({ run_id: run.id, source_item_id: String(id), before_json: null, status: 'rejected' });
    }
  }

  // Optional: load template + contexts once
  let template: any = null;
  if (templateId) {
    const { data: t } = await supabase.from('templates').select('*').eq('id', templateId).maybeSingle();
    template = t || null;
  }
  let selectedContexts: any[] = [];
  if (contextIds.length) {
    const { data: ctxs } = await supabase
      .from('contexts')
      .select('*')
      .in('id', contextIds);
    selectedContexts = ctxs || [];
  }

  let contextTexts: string[] = [];
  if (contextIds.length && (!process.env.OPENAI_API_KEY || !project.openai_vector_store_id)) {
    const { data: chunks } = await supabase
      .from('context_chunks')
      .select('*')
      .in('context_id', contextIds)
      .limit(1000);
    if (chunks?.length) contextTexts = chunks.map((c: any) => c.text).filter(Boolean);
    else if (selectedContexts.length) {
      contextTexts = selectedContexts.map((c: any) => JSON.stringify(c.metadata || {}));
    }
  }

  const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  const stripHtml = (html?: string) => (html || '').replace(/<[^>]+>/g, '').replace(/\u00A0/g, ' ').trim();
  const bulletsToHtml = (items: string[]) => items.length ? `<ul>\n${items.map(i=>`<li>${i}</li>`).join('\n')}\n</ul>` : '';
  const testCasesToHtml = (tcs: any[]) => tcs.length ? `<ul>\n${tcs.map(tc=>`<li><strong>Given</strong> ${tc.given}, <strong>When</strong> ${tc.when}, <strong>Then</strong> ${tc.then}</li>`).join('\n')}\n</ul>` : '';
  const extractText = (resp: any): string => {
    // OpenAI Responses API: output_text, or content[0].text
    if (!resp) return '';
    if (typeof resp.output_text === 'string') return resp.output_text;
    const content = (resp.output?.[0]?.content) || resp.content || resp.choices?.[0]?.message?.content || [];
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const piece = content.find((c: any)=> c.type === 'output_text' || typeof c.text === 'string' || typeof c === 'string');
      if (!piece) return '';
      return piece.text || piece.output_text || (typeof piece === 'string' ? piece : '');
    }
    return '';
  };

  // If small batch, run synchronously so Results are ready immediately; otherwise fall back to background task.
  const processRun = async () => {
    await supabase.from('runs').update({ status: 'running' }).eq('id', run.id);
    const { data: items } = await supabase
      .from('run_items')
      .select('*')
      .eq('run_id', run.id);
    for (const it of (items || [])) {
      try {
        const before = it.before_json || {};
        const beforeText = {
          title: before.title || '',
          descriptionText: stripHtml(before.descriptionHtml),
          acceptanceCriteriaText: stripHtml(before.acceptanceCriteriaHtml),
        };
        let after = before;
        if (openai) {
          const sys = `Principal-level Agile coach and analyst who produces Azure DevOps-ready user stories or discovery SPIKEs.
User Stories (Azure DevOps, plain text only)
Template:
Title: <Story title>
Type: User Story / SPIKE / Bug / Task / Test Case
Role-Goal-Reason: As a <role>, I want <capability> so that <outcome>.
Acceptance Criteria:
- <List here>

Test Cases:
- Given <context>, When <action>, Then <result>

Implementation Notes:
- Tech stack: <List here>
- Security Controls: <List here>
- NFRs: <List here>

Tasks:
- <List here>

Gaps / Ambiguities:
- <List here>

Dependencies:
- <List here>

Story Point Estimate: <Fibonacci or SPIKE timebox>
Estimate Rationale: <List here>

Rules
- Acceptance criteria must not include NFRs or technical implementation details.
- Output user stories in Azure DevOps-ready plain text (no Markdown).
- Story-point estimates follow Fibonacci (1,2,3,5,8,13) with rationale. SPIKEs are timeboxed.
- Keep explanations precise, concise, and professional.
- Always include the Role-Goal-Reason as the first line of the description.
- Replace every '<List here>' placeholder with concrete details derived from the work item, templates, and context. Never leave placeholders in the output.
- Always include the standard engineering tasks PR Review, Dev Testing, and QA Handoff in addition to any context-specific tasks.`;
          const contextNames = selectedContexts
            .map((c: any) => c.file_name || c.metadata?.originalName)
            .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);
          const useVectorStore = Boolean(project.openai_vector_store_id);
          const userPayload = {
            project: { id: params.projectId, name: project.name },
            workItemPlain: beforeText,
            template: template ? { name: template.name, body: template.body } : null,
            selectedContextFiles: contextNames,
            fallbackContext: contextTexts.slice(0, 20),
          };
          const response = await (openai.responses.create as any)({
            model: 'gpt-4o-mini',
            input: [
              {
                role: 'system',
                content: [{ type: 'text', text: sys }],
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      ...userPayload,
                      instructions:
                        'Use retrieval from the linked project vector store. If retrieval returns nothing relevant, rely on the provided work item details and template without inventing facts.',
                    }),
                  },
                ],
              },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'WorkItemEnhancement',
                strict: true,
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    title: { type: 'string' },
                    type: { type: 'string', enum: ['User Story', 'SPIKE', 'Bug', 'Task', 'Test Case'] },
                    roleGoalReason: { type: ['string', 'null'] },
                    descriptionText: { type: 'string' },
                    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
                    testCases: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          given: { type: 'string' },
                          when: { type: 'string' },
                          then: { type: 'string' },
                        },
                        required: ['given', 'when', 'then'],
                      },
                    },
                    implementationNotes: { type: 'array', items: { type: 'string' } },
                    tasks: { type: 'array', items: { type: 'string' } },
                    gaps: { type: 'array', items: { type: 'string' } },
                    dependencies: { type: 'array', items: { type: 'string' } },
                    storyPoints: { type: ['number', 'null'] },
                    estimateRationale: { type: ['string', 'null'] },
                    tags: { type: 'array', items: { type: 'string' } },
                  },
                  required: [
                    'title',
                    'type',
                    'roleGoalReason',
                    'descriptionText',
                    'acceptanceCriteria',
                    'testCases',
                    'implementationNotes',
                    'tasks',
                    'gaps',
                    'dependencies',
                    'storyPoints',
                    'estimateRationale',
                    'tags',
                  ],
                },
              },
            },
            tools: useVectorStore ? [{ type: 'file_search' }] : undefined,
            tool_resources: useVectorStore
              ? { file_search: { vector_store_ids: [project.openai_vector_store_id] } }
              : undefined,
            temperature: 0.3,
          });
          const outText = (response?.output_text || extractText(response) || '').toString();
          let json: any = {};
          try {
            json = JSON.parse(outText);
          } catch {
            json = {};
          }
          let roleGoalReason = json.roleGoalReason as string | null | undefined;
          if (!roleGoalReason && typeof json.descriptionText === 'string') {
            const firstLine = json.descriptionText.split(/\n+/)[0] || '';
            if (/^As a /i.test(firstLine)) roleGoalReason = firstLine.trim();
          }
          const rgr = roleGoalReason ? `<p><strong>Role-Goal-Reason:</strong> ${roleGoalReason}</p>` : '';
          let descriptionText = typeof json.descriptionText === 'string' ? json.descriptionText : '';
          if (roleGoalReason && descriptionText) {
            const lines = descriptionText.split(/\n+/);
            const first = lines[0]?.trim();
            if (first && first.toLowerCase().includes((roleGoalReason as string).toLowerCase())) {
              lines.shift();
              descriptionText = lines.join('\n').trim();
            }
          }
          const mainDesc = descriptionText ? `<p>${descriptionText.replace(/\n+/g, '</p><p>')}</p>` : '';
          const impl = json.implementationNotes && json.implementationNotes.length
            ? `<h3>Implementation Notes</h3>${bulletsToHtml(json.implementationNotes)}`
            : '';
          const estimate =
            json.storyPoints != null || json.estimateRationale
              ? `<h3>Estimate</h3>${
                  json.storyPoints != null ? `<p><strong>Story Points:</strong> ${json.storyPoints}</p>` : ''
                }${json.estimateRationale ? `<p>${json.estimateRationale}</p>` : ''}`
              : '';
          const gapsHtml = json.gaps && json.gaps.length ? `<h3>Gaps / Ambiguities</h3>${bulletsToHtml(json.gaps)}` : '';
          const depsHtml = json.dependencies && json.dependencies.length ? `<h3>Dependencies</h3>${bulletsToHtml(json.dependencies)}` : '';
          const descHtml = (rgr + mainDesc + impl + estimate + gapsHtml + depsHtml) || before.descriptionHtml || '';
          const acHtml =
            (json.acceptanceCriteria && json.acceptanceCriteria.length ? `${bulletsToHtml(json.acceptanceCriteria)}` : '') +
            (json.testCases && json.testCases.length ? `${testCasesToHtml(json.testCases)}` : '');

          const rawTasks = Array.isArray(json.tasks) ? json.tasks.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0) : [];
          const mergedTasks = [...rawTasks];
          for (const t of STANDARD_ENGINEERING_TASKS) {
            if (!mergedTasks.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
              mergedTasks.push(t);
            }
          }

          after = {
            ...before,
            title: json.title || before.title,
            descriptionHtml: descHtml,
            acceptanceCriteriaHtml: acHtml,
            enhanced: {
              type: json.type || null,
              roleGoalReason: roleGoalReason || null,
              descriptionText: json.descriptionText || null,
              acceptanceCriteria: json.acceptanceCriteria || [],
              testCases: json.testCases || [],
              tasks: mergedTasks,
              implementationNotes: json.implementationNotes || [],
              gaps: json.gaps || [],
              dependencies: json.dependencies || [],
              storyPoints: json.storyPoints ?? null,
              estimateRationale: json.estimateRationale ?? null,
              tags: (json.tags || []).concat(['AIEnhanced']).filter(Boolean),
            },
          };
        } else {
          after = {
            ...before,
            title: `${before.title || ''} [AI Suggested]`.trim(),
            descriptionHtml: (before.descriptionHtml || '') + '\n\n<p><em>AI suggestion applied.</em></p>',
          };
        }
        await supabase
          .from('run_items')
          .update({ status: 'generated', after_json: after })
          .eq('id', it.id);
      } catch (err: any) {
        const errorPayload = { error: err?.message || String(err) };
        await supabase.from('run_items').update({ status: 'rejected', after_json: errorPayload }).eq('id', it.id);
      }
    }
    await supabase.from('runs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', run.id);
  };

  if (itemIds.length <= 5) {
    // synchronous small batch
    await processRun();
  } else {
    // background for larger batches
    (async () => {
      try { await processRun(); } catch {}
    })();
  }

  return NextResponse.json({ runId: run.id });
}
