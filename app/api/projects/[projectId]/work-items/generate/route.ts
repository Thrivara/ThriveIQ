import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';
import OpenAI from 'openai';
import { strict } from 'assert';
import { isTrackerIntegration } from 'lib/integrations';


const STANDARD_ENGINEERING_TASKS = ['PR Review', 'Dev Testing', 'QA Handoff'];

// --- Reusable helpers & shared schema (DRY) ---
const clip = (s: unknown, max: number): string =>
  (typeof s === 'string' ? s : (s == null ? '' : String(s))).slice(0, Math.max(0, max));
const approxTokens = (s: string) => Math.ceil(s.length / 4); // rough heuristic

// JSON Schema used for structured outputs, reused across calls
const WORK_ITEM_SCHEMA: any = {
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
};

const TEXT_FORMAT = {
  type: 'json_schema',
  name: 'WorkItemEnhancement',
  strict: true,
  schema: WORK_ITEM_SCHEMA,
} as const;


// --- OpenAI call retry helpers ---
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(to); resolve(v); }, (e) => { clearTimeout(to); reject(e); });
  });
};
type OAICall<T> = () => Promise<T>;
async function callWithRetry<T>(fn: OAICall<T>, label: string, maxRetries = 3): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt <= maxRetries) {
    try {
      // 45s default timeout per call to avoid hanging
      return await withTimeout(fn(), 45_000);
    } catch (err: any) {
      lastErr = err;
      const status = err?.status ?? err?.response?.status;
      const retryAfterHeader = err?.headers?.get?.('retry-after') || err?.response?.headers?.get?.('retry-after');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : undefined;
      const isRetriable =
        status === 408 || status === 409 || status === 425 ||
        status === 429 || (status >= 500 && status <= 599) ||
        (err?.message && /Timeout/i.test(err.message));
      if (!isRetriable || attempt === maxRetries) break;
      const base = 500 * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 250);
      const delay = retryAfter ?? (base + jitter);
      console.warn(`[OpenAI:${label}] attempt ${attempt + 1} failed (status=${status}); retrying in ${delay}ms`);
      await sleep(delay);
      attempt++;
    }
  }
  throw lastErr;
}
// --- End retry helpers ---

// --- Guardrails parsing helpers (dynamic, project-driven) ---
function parseGuardrailsSections(txt: string) {
  const lines = (txt || '').split(/\r?\n/).map(l => l.trim());
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const l of lines) {
    if (!l) continue;
    // Heuristic section headers
    if (/^allowed\b|^primary\b|^allowed\s*\/\s*primary/i.test(l)) { current = 'allowed'; sections.allowed ||= []; continue; }
    if (/^principles\b/i.test(l)) { current = 'principles'; sections.principles ||= []; continue; }
    if (/^forbidden\b|^not allowed\b|^disallowed\b/i.test(l)) { current = 'forbidden'; sections.forbidden ||= []; continue; }
    if (/^conformance\b|^rules?\b|^constraints?\b/i.test(l)) { current = 'conformance'; sections.conformance ||= []; continue; }
    if (/^\-|\•/.test(l)) {
      const item = l.replace(/^[\-\•]\s*/, '').trim();
      if (current) {
        (sections[current] ||= []).push(item);
      }
    }
  }
  return {
    allowed: sections.allowed || [],
    forbidden: sections.forbidden || [],
    principles: sections.principles || [],
    conformance: sections.conformance || [],
  };
}

function buildForbiddenRegexFromGuardrails(txt: string): RegExp | null {
  const { forbidden } = parseGuardrailsSections(txt);
  const terms = forbidden
    .map(s => s
      .replace(/\(.*?\)/g, '') // drop parentheses
      .replace(/^[A-Za-z\s]+:\s*/i, '') // drop leading labels
      .split(/[,\|/]+/) // split comma/pipe/slash lists
      .map(t => t.trim()))
    .flat()
    .filter(Boolean)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // escape for regex
  if (!terms.length) return null;
  // word boundary around each term where possible
  const pattern = '\\b(' + terms.join('|') + ')\\b';
  try { return new RegExp(pattern, 'i'); } catch { return null; }
}
// --- End guardrails parsing helpers ---

async function fetchTrackerItemDetail(integration: any, creds: any, itemId: string) {
  if (integration.type === 'jira') {
    return fetchJiraItemDetail(integration, creds, itemId);
  }
  return fetchAzureItemDetail(integration, creds, itemId);
}

async function fetchAzureItemDetail(integration: any, creds: any, itemId: string) {
  const organization = (integration.metadata as any)?.organization || creds.organization;
  const project = (integration.metadata as any)?.project || creds.project;
  const pat = creds.personalAccessToken;
  if (!organization || !project || !pat) throw new Error('Incomplete Azure DevOps credentials');
  const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
  const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workitems/${encodeURIComponent(itemId)}?api-version=7.1`;
  const resp = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'X-TFS-FedAuthRedirect': 'Suppress',
      'User-Agent': 'ThriveIQ/1.0',
    },
  });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`ADO error: ${resp.status} ${txt.slice(0, 200)}`);
  const json: any = JSON.parse(txt);
  const f = json.fields || {};
  return {
    id: json.id,
    title: f['System.Title'] || '',
    descriptionHtml: (f['System.Description'] || '').toString(),
    acceptanceCriteriaHtml: (f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').toString(),
  };
}

async function fetchJiraItemDetail(integration: any, creds: any, itemId: string) {
  const baseUrl = (integration.metadata as any)?.baseUrl || creds.baseUrl;
  const email = creds.email;
  const apiToken = creds.apiToken;
  if (!baseUrl || !email || !apiToken) {
    throw new Error('Incomplete Jira credentials');
  }
  const authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
  const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(itemId)}?expand=renderedFields`;
  const resp = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`Jira error: ${resp.status} ${txt.slice(0, 200)}`);
  const json: any = JSON.parse(txt);
  const fields = json.fields || {};
  const rendered = json.renderedFields || {};
  return {
    id: json.id || json.key,
    title: fields.summary || '',
    descriptionHtml: rendered.description || '',
    acceptanceCriteriaHtml: '',
  };
}

function getTrackerPrompt(
  trackerType: 'azure_devops' | 'jira',
): { systemPrompt: string; userIntro: string } {
  if (trackerType === 'jira') {
    return {
      systemPrompt: `Principal-level Agile coach and analyst who produces Jira Cloud-ready user stories with Atlassian-friendly formatting.
User Stories (Jira Cloud Description order)
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

Tasks (will become Jira Sub-tasks):
- <List here>

Zephyr Test Cases (Issue Type "Test"):
- <List here>

Gaps / Ambiguities:
- <List here>

Dependencies:
- <List here>

Story Point Estimate: <Fibonacci or SPIKE timebox>
Estimate Rationale: <List here>

Rules
- Description must start with the Role-Goal-Reason sentence and immediately follow with the Acceptance Criteria bullet list.
- Keep explanations precise, concise, and professional. No Markdown headings beyond what Atlassian automatically renders.
- Story-point estimates follow Fibonacci (1,2,3,5,8,13) with rationale. SPIKEs are timeboxed.
- Tasks must be outcome-based and ready to become Jira Sub-tasks.
- Test Cases must use the Given/When/Then structure so they can become Zephyr Test issues.
- Replace every '<List here>' placeholder with concrete details derived from the work item, templates, and context.`,
      userIntro: `You are enhancing a Jira Cloud work item into a complete, Jira-ready user story. Ensure the Description begins with the Role-Goal-Reason sentence immediately followed by the Acceptance Criteria list, and keep formatting compatible with Atlassian's renderer.`,
    };
  }

  return {
    systemPrompt: `Principal-level Agile coach and analyst who's a Power Platform expert who produces Azure DevOps-ready user stories or discovery SPIKEs.
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
- Replace every '<List here>' placeholder with concrete details derived from the work item, templates, and context.`,
    userIntro: `You are enhancing an Azure DevOps work item into a complete, ADO-ready user story.`,
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

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('is_active', true)
    .maybeSingle();
  if (!integration || !isTrackerIntegration(integration.type)) {
    return NextResponse.json({ message: 'Active tracker integration not found' }, { status: 400 });
  }

  const { data: secret } = await supabase
    .from('secrets')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('provider', integration.type)
    .maybeSingle();
  if (!secret) {
    return NextResponse.json({ message: `${integration.type === 'jira' ? 'Jira' : 'Azure DevOps'} secret missing` }, { status: 400 });
  }
  let trackerSecret: any = secret.encrypted_value;
  if (process.env.APP_ENCRYPTION_KEY) {
    const { decryptString } = await import('lib/crypto');
    trackerSecret = decryptString(trackerSecret);
  }
  const trackerCreds = typeof trackerSecret === 'string' ? JSON.parse(trackerSecret) : trackerSecret;

  let templateContainer: Record<string, unknown> | null = null;
  let templateVersion: Record<string, unknown> | null = null;
  if (templateId) {
    const { data: container, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .eq('project_id', params.projectId)
      .maybeSingle();
    if (templateError) return NextResponse.json({ message: templateError.message }, { status: 500 });
    if (!container) return NextResponse.json({ message: 'Template not found' }, { status: 404 });
    if (container.status === 'archived') {
      return NextResponse.json({ message: 'Archived templates cannot be used for generation' }, { status: 400 });
    }

    const { data: publishedVersion, error: versionError } = await supabase
      .from('template_versions')
      .select('*')
      .eq('template_id', templateId)
      .eq('status', 'published')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) return NextResponse.json({ message: versionError.message }, { status: 500 });
    if (!publishedVersion) {
      return NextResponse.json({ message: 'Template must have a published version before generating' }, { status: 400 });
    }
    templateContainer = container;
    templateVersion = publishedVersion;
  }

  // Default project tech guardrails (DB can override via projects.guardrails)
  const DEFAULT_GUARDRAILS = `
  Allowed / Primary Platforms:
  - Microsoft Copilot Studio for conversational experiences
  - Power Automate flows for orchestration and integrations
  - Microsoft Dataverse for operational data storage and standard tables
  Principles:
  - Prefer out-of-the-box (OOTB) capabilities and connectors before proposing any custom code.
  - Only escalate to Azure AI Foundry or other Azure Services when OOTB cannot satisfy clearly-stated requirements.
  Forbidden unless explicitly justified with a concrete gap and approval:
  - .NET/C# services, custom Web APIs, SQL Server schema changes, bespoke front-ends, or unmanaged Azure services.
  Conformance rule:
  - Based on User Story and Context Implementation Notes and Tasks must reference Copilot Studio actions/skills, Power Automate flows, and Dataverse first. If any non-allowed technology is suggested, include a GAP explaining why OOTB is insufficient and add a task to seek approval.
  `;
  const projectGuardrails: string = (project as any).guardrails && String((project as any).guardrails).trim().length
    ? String((project as any).guardrails)
    : DEFAULT_GUARDRAILS;

  // Create run
  const { data: run, error: runErr } = await supabase
    .from('runs')
    .insert({
      user_id: user.id,
      project_id: params.projectId,
      template_id: templateId ?? null,
      template_version_id: templateVersion?.id ?? null,
      template_version: templateVersion?.version ?? null,
      provider: 'openai',
      model: 'gpt-5.2',
      status: 'pending',
      context_refs: { itemIds, contextIds },
    })
    .select()
    .single();
  if (runErr) return NextResponse.json({ message: runErr.message }, { status: 500 });

  // Create run_items with beforeJson snapshot
  for (const id of itemIds) {
    try {
      const before = await fetchTrackerItemDetail(integration, trackerCreds, String(id));
      await supabase.from('run_items').insert({ run_id: run.id, source_item_id: String(id), before_json: before });
    } catch (e) {
      await supabase.from('run_items').insert({ run_id: run.id, source_item_id: String(id), before_json: null, status: 'rejected' });
    }
  }

  // Optional: load template + contexts once
  const template: any = templateContainer
    ? {
        ...templateContainer,
        body: templateVersion?.body,
        variables_json: templateVersion?.variables_json,
        version: templateVersion?.version,
      }
    : null;

    console.log('Using template', template ? { id: template.id, name: template.name, version: template.version } : null);
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
          title: clip(before.title || '', 200),
          descriptionText: clip(stripHtml(before.descriptionHtml), 4000),
          acceptanceCriteriaText: clip(stripHtml(before.acceptanceCriteriaHtml), 2000),
        };
        let after = before;
        if (openai) {
          const trackerPrompts = getTrackerPrompt(integration.type);
          const defaultSys = `${trackerPrompts.systemPrompt}

  Platform Guardrails (Project-Specific)
${projectGuardrails}
`;

          const useVectorStore = Boolean(project.openai_vector_store_id);

          const contextNames = selectedContexts
            .map((c: any) => c.file_name || c.metadata?.originalName)
            .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);

          // Enforce empty fallbackContext when using vector store
          let fallbackContext: string[] = [];
          if (!useVectorStore) {
            const raw = contextTexts.slice(0, 10);
            fallbackContext = raw.map((t) => clip(t, 1500));
          }

          // Build system prompt: prefer selected template; otherwise use default system prompt
          const templateText = (template?.body || '').toString().trim();
          const sysForGeneration = templateText
            ? `${templateText}\n\nPlatform Guardrails (Project-Specific)\n${projectGuardrails}`
            : defaultSys;

          const userPayload = {
            project: { id: params.projectId, name: project.name },
            workItemPlain: beforeText,
            selectedContextFiles: contextNames.slice(0, 10).map((n) => clip(n, 200)),
            fallbackContext,
          };

          console.log('Prompt size debug', {
            titleChars: beforeText.title.length,
            descChars: beforeText.descriptionText.length,
            acChars: beforeText.acceptanceCriteriaText.length,
            tmplChars: template ? (template.body || '').length : 0,
            fallbackChunks: userPayload.fallbackContext.length,
            fallbackTotalChars: userPayload.fallbackContext.reduce((a, b) => a + b.length, 0),
            approxPromptTokens: approxTokens(JSON.stringify({ sys: sysForGeneration, userPayload })),
          });

          // ---------- Phase 1: Retrieval-only micro call (one search, then stop) ----------
          let retrievedSnippets: string[] = [];
          let retrievalSummary: string = '';
          if (useVectorStore) {
            try {
              const retrieval: any = await callWithRetry<any>(
                () => (openai.responses.create as any)({
                  model: 'gpt-5-mini',
                  input: [
                    {
                      role: 'system',
                      content: [{ type: 'input_text', text:
                        `Role: Retrieval summarizer.
                        Goal: Extract ONLY facts and requirements from retrieved files that are directly useful to author the ONE user story described by the query.
                        Hard rules:
                        - DO NOT give best practices, definitions of user stories, or generic advice.
                        - DO NOT fabricate; include only information present in retrieved files.
                        - Run AT MOST one file_search, then STOP.
                        - Output MUST follow the RetrievalSummary JSON schema (no prose, no preamble).
                        Relevance guidance:
                        - Prioritize unique, non-redundant information.
                        - Include detailed requirements and key points.` }],
                    },
                    {
                      role: 'user',
                      content: [
                        {
                          type: 'input_text',
                          text:
                            `Query: ${clip(beforeText.title || '', 200)}\n` +
                            `Context hint: ${clip(beforeText.descriptionText || '', 300)}\n` +
                            `If no evidence is found, return empty arrays and do NOT add generic guidance.`,
                        },
                      ],
                    },
                  ],
                  tools: [
                    {
                      type: 'file_search',
                      vector_store_ids: [project.openai_vector_store_id],
                      max_num_results: 8,
                      ranking_options: { ranker: 'auto', score_threshold: 0.2 },
                    },
                  ],
                  parallel_tool_calls: false,
                  max_tool_calls: 1,
                  include: ['file_search_call.results'],
                  max_output_tokens: 1200,
                  temperature: 0.0,
                }),
                'retrieval',
                1
              );
              console.log('Retrieval response', JSON.stringify(retrieval, null, 2));
              // --- Capture any model-produced summary text
              retrievalSummary = clip(extractText(retrieval), 2000); // capture any model-produced summary text
              if (retrievalSummary && retrievalSummary.trim().length) {
                console.log('Retrieval summary (clipped)', retrievalSummary);
              }
              const results =
                (retrieval.output || [])
                  .filter((n: any) => n?.type === 'file_search_call')
                  .flatMap((n: any) => n?.results || []) || [];
              retrievedSnippets = results.slice(0, 8).map((r: any) => clip(r?.text || '', 1200));
              // Prepend the summary to snippets (so it’s first)
              if (retrievalSummary && retrievalSummary.trim().length) {
                retrievedSnippets.unshift(`[RETRIEVAL SUMMARY]\n${retrievalSummary}`);
              }
              // Update: log summary presence/length
              console.log('Retrieval summary', {
                hits: results.length,
                used: retrievedSnippets.length,
                hasSummary: Boolean(retrievalSummary && retrievalSummary.trim().length),
                summaryChars: (retrievalSummary || '').length,
                totalChars: retrievedSnippets.reduce((a, b) => a + b.length, 0),
              });
            } catch (reErr: any) {
              const reqId =
                reErr?.headers?.get?.('x-request-id') ||
                reErr?.response?.headers?.get?.('x-request-id') ||
                reErr?.request_id ||
                reErr?.requestId ||
                null;
              console.warn('[Retrieval] failed; continuing without snippets', { status: reErr?.status ?? reErr?.response?.status, request_id: reqId, message: reErr?.message });
              // continue with empty retrievedSnippets
            }
          }

          // ---------- Phase 2: Generation-only (no tools) ----------
          const response: any = await callWithRetry<any>(
            () => (openai.responses.create as any)({
              model: 'gpt-5-mini',
              input: [
                {
                  role: 'system',
                  content: [{ type: 'input_text', text: sysForGeneration }],
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text:
                        `${trackerPrompts.userIntro}
                        STRICT TECH CONSTRAINTS: Follow the "Platform Guardrails (Project-Specific)" in the system message.
                        - If inputs or context propose solutions outside the project guardrails, rewrite them to guardrail-compliant options or add a GAP explaining the exception with an approval task.
                        Use the retrievedSummary (if present) and retrievedContext as supporting evidence. Always produce JSON per schema.
                        ` +
                        JSON.stringify({
                          ...userPayload,
                          retrievedSummary: (retrievedSnippets.length && retrievedSnippets[0].startsWith('[RETRIEVAL SUMMARY]')) ? retrievedSnippets[0].slice('[RETRIEVAL SUMMARY]'.length + 1) : '',
                          retrievedContext: retrievedSnippets,
                          instructions:
                            'Use retrievedSummary first (if present) and retrievedContext as supporting evidence. If retrieval returns nothing, rely on inputs; do not invent facts.',
                        }),
                    },
                  ],
                },
              ],
              text: { format: TEXT_FORMAT },
              tool_choice: 'none',
              max_output_tokens: 1200,
              temperature: 0.3,
            }),
            'generation',
            3
          );
          console.log('OpenAI generation response', JSON.stringify(response, null, 2));

          // Prefer structured outputs (.parsed) from the Phase 2 response
          const extractParsed = (r: any): any | null => {
            try {
              const outputs = r?.output || [];
              for (const node of outputs) {
                if (node?.type === 'message') {
                  const parts = node?.content || [];
                  for (const p of parts) {
                    if (p?.parsed) return p.parsed;
                  }
                }
              }
            } catch {}
            return null;
          }
          let parsed = extractParsed(response) || null;

          // Also try output_text as a final fallback
          if (!parsed) {
            const txt = ((response as any)?.output_text || extractText(response) || '').toString();
            try { parsed = JSON.parse(txt); } catch { parsed = null; }
          }

          if (!parsed || typeof parsed !== 'object') {
            throw new Error('Model returned no structured output.');
          }

          let json: any = parsed;

          // Enforce tech guardrails dynamically from projectGuardrails
          const forbiddenRe = buildForbiddenRegexFromGuardrails(projectGuardrails);
          const jsonStrForScan = JSON.stringify({
            implementationNotes: json.implementationNotes || [],
            tasks: json.tasks || [],
            descriptionText: json.descriptionText || '',
            title: json.title || ''
          });
          const mentionsForbidden = !!(forbiddenRe && forbiddenRe.test(jsonStrForScan));
          if (mentionsForbidden) {
            json.gaps = Array.isArray(json.gaps) ? json.gaps : [];
            if (!json.gaps.some((g: string) => /guardrails|approval|justify|exception|conformance/i.test(g))) {
              json.gaps.push('Potential guardrails nonconformance: Proposed technologies appear to conflict with project guardrails. Provide justification, alternatives aligned to guardrails, and request approval if exception is needed.');
            }
            json.tasks = Array.isArray(json.tasks) ? json.tasks : [];
            if (!json.tasks.some((t: string) => /Architectural Approval/i.test(t))) {
              json.tasks.push('Architectural Approval: Review exception request against project guardrails and approve or redirect to guardrail-compliant approach.');
            }
          }

          // Normalize Implementation Notes: only override if empty
          const implNotes = Array.isArray(json.implementationNotes) ? json.implementationNotes : [];
          if (implNotes.length === 0) {
            const { allowed: allowedStack, principles: principleLines } = parseGuardrailsSections(projectGuardrails);
            const preferredNotes: string[] = [];
            // Add principles first (shortened)
            for (const p of principleLines.slice(0, 3)) {
              const note = p.endsWith('.') ? p : `${p}.`;
              preferredNotes.push(note);
            }
            // Then add allowed platforms/tools as guidance
            for (const a of allowedStack.slice(0, 5)) {
              const note = a.endsWith('.') ? a : `${a}.`;
              if (!preferredNotes.includes(note)) preferredNotes.push(note);
            }
            json.implementationNotes = preferredNotes;
          } else {
            json.implementationNotes = implNotes;
          }

          // --- The rest of your transformation to tracker fields (unchanged below this line) ---
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
        const reqId =
          err?.headers?.get?.('x-request-id') ||
          err?.response?.headers?.get?.('x-request-id') ||
          err?.request_id ||
          err?.requestId ||
          null;
        const errorPayload = { error: err?.message || String(err), request_id: reqId, status: err?.status ?? err?.response?.status ?? null };
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
