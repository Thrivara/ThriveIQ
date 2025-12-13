import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';
import { decryptString } from 'lib/crypto';
import { isTrackerIntegration } from 'lib/integrations';

export async function POST(req: Request, { params }: { params: { runId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const selectedItemIds: string[] = body.selectedItemIds || [];
  const selectedFields: string[] = body.selectedFields || ['title','description','acceptance'];
  const createTasks: boolean = !!body.createTasks;
  const createTestCases: boolean = !!body.createTestCases;
  const setStoryPoints: boolean = !!body.setStoryPoints;
  const overrides: Record<string, any> = body.overrides || {};

  // Fetch run and items
  const { data: run } = await supabase.from('runs').select('*').eq('id', params.runId).maybeSingle();
  if (!run) return NextResponse.json({ message: 'Run not found' }, { status: 404 });
  const { data: runItems } = await supabase.from('run_items').select('*').eq('run_id', params.runId);

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('project_id', run.project_id)
    .eq('is_active', true)
    .maybeSingle();
  if (!integration || !isTrackerIntegration(integration.type)) {
    return NextResponse.json({ message: 'Tracker integration missing' }, { status: 400 });
  }

  const { data: secret } = await supabase
    .from('secrets')
    .select('*')
    .eq('project_id', run.project_id)
    .eq('provider', integration.type)
    .maybeSingle();
  if (!secret) return NextResponse.json({ message: `${integration.type === 'jira' ? 'Jira' : 'ADO'} secret missing` }, { status: 400 });
  let trackerSecret: any = secret.encrypted_value;
  if (process.env.APP_ENCRYPTION_KEY) trackerSecret = decryptString(trackerSecret);
  const trackerCreds = typeof trackerSecret === 'string' ? JSON.parse(trackerSecret) : trackerSecret;

  const results: any[] = [];
  for (const item of (runItems || [])) {
    if (selectedItemIds.length && !selectedItemIds.includes(item.id)) continue;
    try {
      const after = item.after_json || {};
      const enhanced = after.enhanced || {};
      const override = overrides[item.id] || null;
      if (override) {
        if (typeof override.title === 'string') after.title = override.title;
        if (typeof override.descriptionHtml === 'string') {
          after.descriptionHtml = override.descriptionHtml;
          after._overrideDescription = override.descriptionHtml;
        }
        if (typeof override.acceptanceCriteriaHtml === 'string') {
          after.acceptanceCriteriaHtml = override.acceptanceCriteriaHtml;
          after._overrideAcceptance = override.acceptanceCriteriaHtml;
        }
        if (Object.prototype.hasOwnProperty.call(override, 'storyPoints')) {
          const spValue = typeof override.storyPoints === 'number' && !Number.isNaN(override.storyPoints)
            ? override.storyPoints
            : null;
          after.enhanced = after.enhanced || {};
          after.enhanced.storyPoints = spValue;
        }
        if (Array.isArray(override.tasks)) {
          after.enhanced = after.enhanced || {};
          after.enhanced.tasks = override.tasks
            .map((t: any) => (typeof t === 'string' ? t.trim() : ''))
            .filter((t: string) => t.length > 0);
        }
      }
      let trackerResult;
      if (integration.type === 'jira') {
        trackerResult = await applyJiraWorkItem({
          integration,
          creds: trackerCreds,
          item,
          after,
          enhanced,
          selectedFields,
          createTasks,
          createTestCases,
          setStoryPoints,
        });
      } else {
        trackerResult = await applyAzureWorkItem({
          integration,
          creds: trackerCreds,
          item,
          after,
          enhanced,
          selectedFields,
          createTasks,
          createTestCases,
          setStoryPoints,
        });
      }

      if (trackerResult.success) {
        await supabase.from('run_items').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', item.id);
      } else {
        await supabase.from('run_items').update({ status: 'rejected' }).eq('id', item.id);
      }
      results.push({ itemId: item.id, success: trackerResult.success, error: trackerResult.error });
    } catch (e: any) {
      await supabase.from('run_items').update({ status: 'rejected' }).eq('id', item.id);
      results.push({ itemId: item.id, success: false, error: e.message });
    }
  }

  return NextResponse.json({ results });
}

type ApplyTrackerArgs = {
  integration: any;
  creds: any;
  item: any;
  after: any;
  enhanced: any;
  selectedFields: string[];
  createTasks: boolean;
  createTestCases: boolean;
  setStoryPoints: boolean;
};

async function applyAzureWorkItem(args: ApplyTrackerArgs): Promise<{ success: boolean; error?: string }> {
  const { integration, creds, item, after, enhanced, selectedFields, createTasks, createTestCases, setStoryPoints } = args;
  const organization = (integration.metadata as any)?.organization || creds.organization;
  const project = (integration.metadata as any)?.project || creds.project;
  const pat = creds.personalAccessToken;
  if (!organization || !project || !pat) {
    return { success: false, error: 'Incomplete Azure DevOps credentials' };
  }
  const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
  const bullets = (arr: string[]) => (arr && arr.length ? `<ul>\n${arr.map((i: string) => `<li>${i}</li>`).join('\n')}\n</ul>` : '');
  const tcsHtml = (tcs: any[]) =>
    tcs && tcs.length
      ? `<ul>\n${tcs
          .map(
            (tc: any) =>
              `<li><strong>Given</strong> ${tc.given}, <strong>When</strong> ${tc.when}, <strong>Then</strong> ${tc.then}</li>`,
          )
          .join('\n')}\n</ul>`
      : '';
  const para = (txt?: string) => ((txt || '').trim() ? `<p>${String(txt).trim().replace(/\n+/g, '</p><p>')}</p>` : '');

  const parentUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workitems/${encodeURIComponent(
    item.source_item_id,
  )}?api-version=7.1`;
  const currentResp = await fetch(parentUrl, {
    headers: { Authorization: authHeader, Accept: 'application/json', 'X-TFS-FedAuthRedirect': 'Suppress', 'User-Agent': 'ThriveIQ/1.0' },
  });
  if (!currentResp.ok) {
    const t = await currentResp.text();
    return { success: false, error: t };
  }
  const currentJson: any = await currentResp.json().catch(() => ({}));
  const currentTags: string = currentJson?.fields?.['System.Tags'] || '';
  const assignedRaw = currentJson?.fields?.['System.AssignedTo'];
  const assignedIdentity =
    typeof assignedRaw === 'string'
      ? assignedRaw
      : assignedRaw?.uniqueName || assignedRaw?.displayName || null;
  const existingTaskTitles = await collectAdoChildTaskTitles(currentJson, authHeader);

  const ops: any[] = [];
  if (selectedFields.includes('title') && after.title) ops.push({ op: 'add', path: '/fields/System.Title', value: after.title });
  if (selectedFields.includes('description')) {
    const rgr = enhanced.roleGoalReason ? `<p><strong>Role-Goal-Reason:</strong> ${enhanced.roleGoalReason}</p>` : '';
    const main = para(enhanced.descriptionText) || (after.descriptionHtml ?? '');
    const impl = bullets(enhanced.implementationNotes || []);
    const estimate =
      typeof enhanced.storyPoints === 'number' || enhanced.estimateRationale
        ? `${typeof enhanced.storyPoints === 'number' ? `<p><strong>Story Points:</strong> ${enhanced.storyPoints}</p>` : ''}${para(
            enhanced.estimateRationale,
          )}`
        : '';
    const gaps = bullets(enhanced.gaps || []);
    const deps = bullets(enhanced.dependencies || []);
      const combined =
        (after.descriptionHtml ??
          (rgr +
            main +
            (impl ? `<h3>Implementation Notes</h3>${impl}` : '') +
            (estimate ? `<h3>Estimate</h3>${estimate}` : '') +
            (gaps ? `<h3>Gaps / Ambiguities</h3>${gaps}` : '') +
            (deps ? `<h3>Dependencies</h3>${deps}` : ''))) ||
        '';
    ops.push({ op: 'add', path: '/fields/System.Description', value: combined });
  }
  if (selectedFields.includes('acceptance')) {
    const combinedAc =
      (after.acceptanceCriteriaHtml && String(after.acceptanceCriteriaHtml)) ||
      `${bullets(enhanced.acceptanceCriteria || [])}${tcsHtml(enhanced.testCases || [])}`;
    ops.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria', value: combinedAc });
  }
  if (setStoryPoints && typeof enhanced.storyPoints === 'number') {
    ops.push({ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.StoryPoints', value: enhanced.storyPoints });
  }
  const tagsSet = new Set((currentTags || '').split(';').map((s: string) => s.trim()).filter(Boolean));
  (enhanced.tags || ['AIEnhanced']).forEach((t: string) => tagsSet.add(t));
  const mergedTags = Array.from(tagsSet).join('; ');
  ops.push({ op: 'add', path: '/fields/System.Tags', value: mergedTags });

  const url = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(
    project,
  )}/_apis/wit/workitems/${encodeURIComponent(item.source_item_id)}?api-version=7.1`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json-patch+json',
      Accept: 'application/json',
      'X-TFS-FedAuthRedirect': 'Suppress',
      'User-Agent': 'ThriveIQ/1.0',
    },
    body: JSON.stringify(ops),
  });
  if (!resp.ok) {
    const t = await resp.text();
    return { success: false, error: t };
  }

  if (createTasks && Array.isArray(enhanced?.tasks) && enhanced.tasks.length) {
    for (const t of enhanced.tasks) {
      const summary = typeof t === 'string' ? t.trim() : '';
      if (!summary) continue;
      const normalized = summary.toLowerCase();
      if (existingTaskTitles.has(normalized)) continue;
      existingTaskTitles.add(normalized);
      try {
        const childOps = [
          { op: 'add', path: '/fields/System.Title', value: summary },
          {
            op: 'add',
            path: '/relations/-',
            value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workItems/${encodeURIComponent(item.source_item_id)}` },
          },
        ];
        if (assignedIdentity) {
          childOps.push({ op: 'add', path: '/fields/System.AssignedTo', value: assignedIdentity });
        }
        const childUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wit/workitems/$Task?api-version=7.1`;
        await fetch(childUrl, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json-patch+json', Accept: 'application/json' },
          body: JSON.stringify(childOps),
        });
      } catch {
        // Non-blocking
      }
    }
  }

  if (createTestCases && Array.isArray(enhanced?.testCases) && enhanced.testCases.length) {
    for (const tc of enhanced.testCases) {
      try {
        const title = `Test: Given ${tc.given}, When ${tc.when}, Then ${tc.then}`;
        const tcDesc = `<p><strong>Given</strong> ${tc.given}</p><p><strong>When</strong> ${tc.when}</p><p><strong>Then</strong> ${tc.then}</p>`;
        const childOps = [
          { op: 'add', path: '/fields/System.Title', value: title },
          { op: 'add', path: '/fields/System.Description', value: tcDesc },
          {
            op: 'add',
            path: '/relations/-',
            value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workItems/${encodeURIComponent(item.source_item_id)}` },
          },
        ];
        const tcUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wit/workitems/$Test%20Case?api-version=7.1`;
        await fetch(tcUrl, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json-patch+json', Accept: 'application/json' },
          body: JSON.stringify(childOps),
        });
      } catch {
        // Non-blocking
      }
    }
  }

  return { success: true };
}

async function applyJiraWorkItem(args: ApplyTrackerArgs): Promise<{ success: boolean; error?: string }> {
  const { integration, creds, item, after, enhanced, selectedFields, createTasks, createTestCases, setStoryPoints } = args;
  const baseUrl = (integration.metadata as any)?.baseUrl || creds.baseUrl;
  const projectKey = (integration.metadata as any)?.projectKey;
  const email = creds.email;
  const apiToken = creds.apiToken;
  const storyPointsFieldId = (integration.metadata as any)?.storyPointsFieldId;
  const testCaseIssueType = (integration.metadata as any)?.testCaseIssueType || 'Test';
  if (!baseUrl || !projectKey || !email || !apiToken) {
    return { success: false, error: 'Incomplete Jira credentials' };
  }
  const authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
  const issueKey = item.source_item_id;
  const issueUrl = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;

  const issueResp = await fetch(issueUrl, { headers: { Authorization: authHeader, Accept: 'application/json' } });
  if (!issueResp.ok) {
    const text = await issueResp.text();
    return { success: false, error: text };
  }
  const issueJson: any = await issueResp.json();
  const currentLabels: string[] = Array.isArray(issueJson?.fields?.labels) ? issueJson.fields.labels.filter(Boolean) : [];
  const assigneeAccountId = issueJson?.fields?.assignee?.accountId ?? null;
  const existingSubtaskSummaries = new Set<string>();
  (issueJson?.fields?.subtasks || []).forEach((subtask: any) => {
    const summary =
      subtask?.fields?.summary ||
      subtask?.summary ||
      (typeof subtask === 'string' ? subtask : null);
    if (typeof summary === 'string' && summary.trim().length) {
      existingSubtaskSummaries.add(summary.trim().toLowerCase());
    }
  });

  const fieldsUpdate: Record<string, any> = {};
  if (selectedFields.includes('title') && after.title) {
    fieldsUpdate.summary = after.title;
  }
  const shouldUpdateDescription = selectedFields.includes('description') || selectedFields.includes('acceptance');
  if (shouldUpdateDescription) {
    if (after._overrideDescription) {
      const acceptanceHtml = renderAcceptanceHtml(collectAcceptanceItems(enhanced, after));
      const testCaseHtml = renderTestCaseHtml(collectTestCaseItems(enhanced));
      const compiledHtml = [after._overrideDescription, acceptanceHtml, testCaseHtml].filter(Boolean).join('\n');
      fieldsUpdate.description = htmlToAdf(compiledHtml);
    } else {
      fieldsUpdate.description = buildJiraDescriptionDoc(enhanced, after);
    }
  }
  if (setStoryPoints && typeof enhanced.storyPoints === 'number' && storyPointsFieldId) {
    fieldsUpdate[storyPointsFieldId] = enhanced.storyPoints;
  }
  const mergedLabels = new Set(currentLabels);
  (enhanced.tags || ['AIEnhanced']).forEach((tag: string) => {
    const sanitized = sanitizeJiraLabel(tag);
    if (sanitized) mergedLabels.add(sanitized);
  });
  fieldsUpdate.labels = Array.from(mergedLabels);

  const updateResp = await fetch(issueUrl, {
    method: 'PUT',
    headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fieldsUpdate }),
  });
  if (!updateResp.ok) {
    const text = await updateResp.text();
    return { success: false, error: text };
  }

  if (createTasks && Array.isArray(enhanced?.tasks) && enhanced.tasks.length) {
    await createJiraSubTasks(baseUrl, authHeader, projectKey, issueKey, enhanced.tasks, existingSubtaskSummaries, assigneeAccountId);
  }
  if (createTestCases && Array.isArray(enhanced?.testCases) && enhanced.testCases.length) {
    await createJiraTestCases(baseUrl, authHeader, projectKey, issueKey, enhanced.testCases, testCaseIssueType);
  }

  return { success: true };
}

async function createJiraSubTasks(
  baseUrl: string,
  authHeader: string,
  projectKey: string,
  parentKey: string,
  tasks: string[],
  existingSummaries: Set<string>,
  assigneeAccountId: string | null,
) {
  for (const task of tasks) {
    const summary = typeof task === 'string' ? task.trim() : '';
    if (!summary) continue;
    const normalized = summary.toLowerCase();
    if (existingSummaries.has(normalized)) continue;
    existingSummaries.add(normalized);
    try {
      await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            parent: { key: parentKey },
            summary,
            issuetype: { name: 'Sub-task' },
            ...(assigneeAccountId ? { assignee: { accountId: assigneeAccountId } } : {}),
          },
        }),
      });
    } catch {
      // Ignore individual failures
    }
  }
}

async function createJiraTestCases(
  baseUrl: string,
  authHeader: string,
  projectKey: string,
  parentKey: string,
  testCases: any[],
  issueType: string,
) {
  for (const tc of testCases) {
    try {
      const summary = `Test: Given ${tc.given}, When ${tc.when}, Then ${tc.then}`;
      const description = buildJiraTestCaseDoc(tc);
      const resp = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary,
            description,
            issuetype: { name: issueType },
          },
        }),
      });
      if (!resp.ok) continue;
      const created = await resp.json();
      await fetch(`${baseUrl}/rest/api/3/issueLink`, {
        method: 'POST',
        headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: { name: 'Relates' },
          inwardIssue: { key: created.key },
          outwardIssue: { key: parentKey },
        }),
      });
    } catch {
      // Ignore linking failures
    }
  }
}

function buildJiraDescriptionDoc(enhanced: any, after: any) {
  const doc: any = { version: 1, type: 'doc', content: [] };

  const pushParagraph = (text: string) => {
    if (!text) return;
    doc.content.push({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    });
  };

  const pushHeading = (text: string) => {
    doc.content.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text,
          marks: [{ type: 'strong' }],
        },
      ],
    });
  };

  const pushList = (items: string[]) => {
    if (!items.length) return;
    doc.content.push({
      type: 'bulletList',
      content: items.map((item) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
      })),
    });
  };

  if (enhanced.roleGoalReason) {
    pushParagraph(`Role-Goal-Reason: ${enhanced.roleGoalReason}`);
  }
  const acceptanceItems = collectAcceptanceItems(enhanced, after);
  if (acceptanceItems.length) {
    pushHeading('Acceptance Criteria');
    pushList(acceptanceItems);
  }
  const formattedTestCases = collectTestCaseItems(enhanced);
  if (formattedTestCases.length) {
    pushHeading('Test Cases');
    pushList(formattedTestCases);
  }
  const descriptionText =
    enhanced.descriptionText || stripHtml(after.descriptionHtml || '');
  if (descriptionText) {
    descriptionText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => pushParagraph(line));
  }
  if (Array.isArray(enhanced.implementationNotes) && enhanced.implementationNotes.length) {
    pushHeading('Implementation Notes');
    pushList(enhanced.implementationNotes);
  }
  if (typeof enhanced.storyPoints === 'number' || enhanced.estimateRationale) {
    pushHeading('Estimate');
    if (typeof enhanced.storyPoints === 'number') pushParagraph(`Story Points: ${enhanced.storyPoints}`);
    if (enhanced.estimateRationale) pushParagraph(enhanced.estimateRationale);
  }
  if (Array.isArray(enhanced.gaps) && enhanced.gaps.length) {
    pushHeading('Gaps / Ambiguities');
    pushList(enhanced.gaps);
  }
  if (Array.isArray(enhanced.dependencies) && enhanced.dependencies.length) {
    pushHeading('Dependencies');
    pushList(enhanced.dependencies);
  }
  if (!doc.content.length) {
    pushParagraph('Generated description');
  }
  return doc;
}

function buildJiraTestCaseDoc(tc: { given: string; when: string; then: string }) {
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Given ${tc.given}` }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `When ${tc.when}` }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Then ${tc.then}` }],
      },
    ],
  };
}

const stripHtml = (html?: string) => (html || '').replace(/<[^>]+>/g, '').replace(/\u00A0/g, ' ').trim();

function extractListFromHtml(html?: string): string[] {
  if (!html) return [];
  const normalized = (html || '')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>(?!\n)/gi, '\n');
  return normalized
    .split(/\n+/)
    .map((line) => stripHtml(line).trim())
    .filter((line) => line.length > 0);
}

function collectAcceptanceItems(enhanced: any, after: any): string[] {
  if (after?._overrideAcceptance) {
    const overrides = extractListFromHtml(after._overrideAcceptance);
    if (overrides.length) return overrides;
  }
  return Array.isArray(enhanced?.acceptanceCriteria) ? enhanced.acceptanceCriteria : [];
}

function collectTestCaseItems(enhanced: any): string[] {
  if (!Array.isArray(enhanced?.testCases)) return [];
  return enhanced.testCases
    .map((tc: any) => {
      if (!tc || (!tc.given && !tc.when && !tc.then)) return null;
      return [tc.given, tc.when, tc.then].some((part) => typeof part === 'string' && part.trim().length)
        ? `Given ${tc.given || ''}, When ${tc.when || ''}, Then ${tc.then || ''}`.replace(/\s+,/g, ',').trim()
        : null;
    })
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function renderAcceptanceHtml(items: string[]): string {
  if (!items.length) return '';
  return `<h3>Acceptance Criteria</h3><ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function renderTestCaseHtml(items: string[]): string {
  if (!items.length) return '';
  return `<h3>Test Cases</h3><ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function sanitizeJiraLabel(label: string): string | null {
  if (!label) return null;
  const normalized = label
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .replace(/-+/g, '-');
  return normalized.length ? normalized : null;
}

async function collectAdoChildTaskTitles(currentJson: any, authHeader: string): Promise<Set<string>> {
  const titles = new Set<string>();
  const relations: any[] = Array.isArray(currentJson?.relations) ? currentJson.relations : [];
  for (const relation of relations) {
    if (!relation || relation.rel !== 'System.LinkTypes.Hierarchy-Forward' || !relation.url) continue;
    try {
      const resp = await fetch(`${relation.url}?api-version=7.1`, {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'X-TFS-FedAuthRedirect': 'Suppress',
          'User-Agent': 'ThriveIQ/1.0',
        },
      });
      if (!resp.ok) continue;
      const json: any = await resp.json().catch(() => ({}));
      const title = json?.fields?.['System.Title'];
      if (typeof title === 'string' && title.trim().length) {
        titles.add(title.trim().toLowerCase());
      }
    } catch {
      // ignore
    }
  }
  return titles;
}


function htmlToAdf(html: string): any {
  const normalized = (html || '')
    .replace(/\r/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<h3[^>]*>/gi, '\n### ')
    .replace(/<\/h3>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<strong>/gi, '**')
    .replace(/<\/strong>/gi, '**')
    .replace(/<b>/gi, '**')
    .replace(/<\/b>/gi, '**')
    .replace(/<em>/gi, '_')
    .replace(/<\/em>/gi, '_')
    .replace(/<i>/gi, '_')
    .replace(/<\/i>/gi, '_');

  const withoutTags = normalized.replace(/<[^>]+>/g, '');
  const sections = withoutTags
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const content: any[] = [];
  const paragraphs = sections.length ? sections : [''];

  paragraphs.forEach((paragraph) => {
    const lines = paragraph.split(/\n/).map((line) => line.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every((line) => /^(-|\*)\s+/.test(line));
    if (isList) {
      content.push({
        type: 'bulletList',
        content: lines.map((line) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: buildInlineNodes(line.replace(/^(-|\*)\s+/, '')) }],
        })),
      });
      return;
    }

    if (/^###\s+/.test(paragraph)) {
      const headingText = paragraph.replace(/^###\s+/, '').trim();
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: buildInlineNodes(headingText),
      });
      return;
    }

    content.push({ type: 'paragraph', content: buildInlineNodes(paragraph) });
  });

  if (!content.length) {
    content.push({ type: 'paragraph', content: [{ type: 'text', text: '' }] });
  }

  return {
    version: 1,
    type: 'doc',
    content,
  };
}

function buildInlineNodes(text: string): any[] {
  const nodes: any[] = [];
  let remaining = text;

  const pushText = (value: string) => {
    if (!value) return;
    nodes.push({ type: 'text', text: value });
  };

  while (remaining.length) {
    const boldStart = remaining.indexOf('**');
    const italicStart = remaining.indexOf('_');

    let marker: { start: number; end: number; type: 'bold' | 'italic'; length: number } | null = null;

    if (boldStart !== -1) {
      const boldEnd = remaining.indexOf('**', boldStart + 2);
      if (boldEnd !== -1) {
        marker = { start: boldStart, end: boldEnd, type: 'bold', length: 2 };
      }
    }

    if (italicStart !== -1) {
      const italicEnd = remaining.indexOf('_', italicStart + 1);
      if (italicEnd !== -1) {
        const italicMarker = { start: italicStart, end: italicEnd, type: 'italic', length: 1 };
        if (!marker || italicMarker.start < marker.start) {
          marker = italicMarker;
        }
      }
    }

    if (!marker) {
      pushText(remaining);
      break;
    }

    if (marker.start > 0) {
      pushText(remaining.slice(0, marker.start));
    }

    const inner = remaining.slice(marker.start + marker.length, marker.end);
    if (inner) {
      nodes.push({
        type: 'text',
        text: inner,
        marks: [{ type: marker.type === 'bold' ? 'strong' : 'em' }],
      });
    }

    remaining = remaining.slice(marker.end + marker.length);
  }

  return nodes.length ? nodes : [{ type: 'text', text: '' }];
}
