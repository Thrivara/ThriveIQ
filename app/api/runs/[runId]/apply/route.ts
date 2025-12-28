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
        if (Array.isArray(override.acceptanceCriteria)) {
          after.enhanced = after.enhanced || {};
          after.enhanced.acceptanceCriteria = override.acceptanceCriteria
            .map((ac: any) => (typeof ac === 'string' ? ac.trim() : ''))
            .filter((ac: string) => ac.length > 0);
        }
        if (Array.isArray(override.testCases)) {
          after.enhanced = after.enhanced || {};
          after.enhanced.testCases = override.testCases
            .map((tc: any) => {
              if (!tc || typeof tc !== 'object') return null;
              
              // Support new format (name + bddScript)
              if (tc.name !== undefined || tc.bddScript !== undefined) {
                const name = typeof tc.name === 'string' ? tc.name.trim() : '';
                const bddScript = typeof tc.bddScript === 'string' ? tc.bddScript.trim() : '';
                if (!name && !bddScript) return null;
                return { name, bddScript };
              }
              
              // Legacy format (given/when/then)
              let given = typeof tc.given === 'string' ? tc.given.trim() : '';
              let when = typeof tc.when === 'string' ? tc.when.trim() : '';
              let then = typeof tc.then === 'string' ? tc.then.trim() : '';
              // Remove prefixes if present
              given = given.replace(/^Given\s+/i, '').trim();
              when = when.replace(/^When\s+/i, '').trim();
              then = then.replace(/^Then\s+/i, '').trim();
              if (!given && !when && !then) return null;
              return { given, when, then };
            })
            .filter((tc: any) => tc !== null);
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
      results.push({ 
        itemId: item.id, 
        success: trackerResult.success, 
        error: trackerResult.error,
        subtasksCreated: trackerResult.subtasksCreated || 0,
        testCasesCreated: trackerResult.testCasesCreated || 0,
        testCasesUpdated: trackerResult.testCasesUpdated || 0,
      });
    } catch (e: any) {
      await supabase.from('run_items').update({ status: 'rejected' }).eq('id', item.id);
      results.push({ 
        itemId: item.id, 
        success: false, 
        error: e.message,
        subtasksCreated: 0,
        testCasesCreated: 0,
        testCasesUpdated: 0,
      });
    }
  }

  // Aggregate counts across all results
  const totalSubtasksCreated = results.reduce((sum, r) => sum + (r.subtasksCreated || 0), 0);
  const totalTestCasesCreated = results.reduce((sum, r) => sum + (r.testCasesCreated || 0), 0);
  const totalTestCasesUpdated = results.reduce((sum, r) => sum + (r.testCasesUpdated || 0), 0);

  return NextResponse.json({ 
    results,
    summary: {
      subtasksCreated: totalSubtasksCreated,
      testCasesCreated: totalTestCasesCreated,
      testCasesUpdated: totalTestCasesUpdated,
    },
  });
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

type ApplyResult = {
  success: boolean;
  error?: string;
  subtasksCreated?: number;
  testCasesCreated?: number;
  testCasesUpdated?: number;
};

async function applyAzureWorkItem(args: ApplyTrackerArgs): Promise<ApplyResult> {
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

  let testCasesCreated = 0;
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
        const resp = await fetch(tcUrl, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json-patch+json', Accept: 'application/json' },
          body: JSON.stringify(childOps),
        });
        if (resp.ok) testCasesCreated++;
      } catch {
        // Non-blocking
      }
    }
  }

  return { success: true, testCasesCreated };
}

async function applyJiraWorkItem(args: ApplyTrackerArgs): Promise<ApplyResult> {
  const { integration, creds, item, after, enhanced, selectedFields, createTasks, createTestCases, setStoryPoints } = args;
  const baseUrl = (integration.metadata as any)?.baseUrl || creds.baseUrl;
  const projectKey = (integration.metadata as any)?.projectKey;
  const email = creds.email;
  const apiToken = creds.apiToken;
  const zephyrApiToken = creds.zephyrApiToken; // Zephyr Scale API token
  const storyPointsFieldId = (integration.metadata as any)?.storyPointsFieldId;
  const testCaseIssueType = (integration.metadata as any)?.testCaseIssueType || 'Test';
  
  // New configuration options
  const acceptanceCriteriaMapping = (integration.metadata as any)?.acceptanceCriteriaMapping || 'description';
  const acceptanceCriteriaFieldId = (integration.metadata as any)?.acceptanceCriteriaFieldId;
  const testCasesMapping = (integration.metadata as any)?.testCasesMapping || 'description';
  const testCasesFieldId = (integration.metadata as any)?.testCasesFieldId;
  
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
  
  // Handle Acceptance Criteria mapping
  // Always update if mapping is configured, regardless of selectedFields
  const acceptanceItems = collectAcceptanceItems(enhanced, after);
  if (acceptanceItems.length > 0) {
    if (acceptanceCriteriaMapping === 'custom_field' && acceptanceCriteriaFieldId) {
      // Map to custom field - format as ADF bullet list (required for rich text fields)
      fieldsUpdate[acceptanceCriteriaFieldId] = buildAdfBulletList(acceptanceItems);
    }
    // If mapping is 'description', it will be included in description below
  }
  
  // Handle Test Cases mapping
  // Always update if mapping is configured, regardless of selectedFields
  const testCaseItems = collectTestCaseItems(enhanced);
  if (testCaseItems.length > 0) {
    if (testCasesMapping === 'custom_field' && testCasesFieldId) {
      // Map to custom field - format as ADF bullet list (required for rich text fields)
      fieldsUpdate[testCasesFieldId] = buildAdfBulletList(testCaseItems);
    }
    // If mapping is 'zephyr' or 'description', handled below
  }
  
  // Build description (excluding AC/TC if they're mapped elsewhere)
  // Update description if:
  // - 'description' is selected, OR
  // - 'acceptance' is selected AND AC mapping is 'description'
  const shouldUpdateDescription = selectedFields.includes('description') || 
    (selectedFields.includes('acceptance') && acceptanceCriteriaMapping === 'description');
  if (shouldUpdateDescription) {
    if (after._overrideDescription) {
      // For override, only include AC/TC if they're not mapped to custom fields or Zephyr
      const acceptanceHtml = acceptanceCriteriaMapping === 'description' 
        ? renderAcceptanceHtml(acceptanceItems)
        : '';
      const testCaseHtml = testCasesMapping === 'description'
        ? renderTestCaseHtml(testCaseItems)
        : '';
      const compiledHtml = [after._overrideDescription, acceptanceHtml, testCaseHtml].filter(Boolean).join('\n');
      fieldsUpdate.description = htmlToAdf(compiledHtml);
    } else {
      // Exclude AC if mapped to custom field, exclude TC if mapped to custom field or Zephyr
      fieldsUpdate.description = buildJiraDescriptionDoc(
        enhanced, 
        after, 
        acceptanceCriteriaMapping !== 'description', // exclude AC if not in description
        testCasesMapping !== 'description' // exclude TC if not in description
      );
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

  let subtasksCreated = 0;
  let testCasesCreated = 0;
  let testCasesUpdated = 0;
  
  if (createTasks && Array.isArray(enhanced?.tasks) && enhanced.tasks.length) {
    subtasksCreated = await createJiraSubTasks(baseUrl, authHeader, projectKey, issueKey, enhanced.tasks, existingSubtaskSummaries, assigneeAccountId);
  }
  
  // Handle test cases creation based on mapping
  if (Array.isArray(enhanced?.testCases) && enhanced.testCases.length) {
    console.log(`Processing ${enhanced.testCases.length} test cases with mapping: ${testCasesMapping}`);
    console.log('Test cases data:', JSON.stringify(enhanced.testCases, null, 2));
    
    if (testCasesMapping === 'zephyr') {
      // Create Zephyr test cases using Zephyr Scale API v2
      // Requires a separate Zephyr API token (not the same as Jira API token)
      if (!zephyrApiToken) {
        console.error('Zephyr test case mapping selected but no Zephyr API token provided');
        // Don't fail the entire operation, just log the error
      } else {
        // Use Zephyr Bearer token auth instead of Jira Basic auth
        const zephyrAuthHeader = `Bearer ${zephyrApiToken}`;
        console.log('Calling createZephyrTestCases with:', {
          projectKey,
          issueKey,
          testCaseCount: enhanced.testCases.length,
          firstTestCase: enhanced.testCases[0]
        });
        const zephyrResult = await createZephyrTestCases(
          baseUrl, 
          zephyrAuthHeader,
          authHeader, // Jira auth header for linking test cases to issues
          projectKey, 
          issueKey, 
          enhanced.testCases,
          testCaseIssueType // Optional - only for documentation/reference
        );
        testCasesCreated = zephyrResult.created;
        testCasesUpdated = zephyrResult.updated;
        if (zephyrResult.errors.length > 0) {
          // Log errors but don't fail the entire operation
          console.error('Zephyr test case creation had errors:', zephyrResult.errors);
          // Optionally return a warning - for now we'll still return success
          // as the main issue update succeeded
        } else {
          console.log(`Zephyr test cases: ${zephyrResult.created} created, ${zephyrResult.updated} updated`);
        }
      }
    } else if (createTestCases && testCasesMapping === 'description') {
      // Create as regular Jira test case issues (existing behavior)
      testCasesCreated = await createJiraTestCases(baseUrl, authHeader, projectKey, issueKey, enhanced.testCases, testCaseIssueType);
    }
    // If testCasesMapping === 'custom_field', test cases are already mapped above
  }

  return { 
    success: true, 
    subtasksCreated,
    testCasesCreated,
    testCasesUpdated,
  };
}

async function createJiraSubTasks(
  baseUrl: string,
  authHeader: string,
  projectKey: string,
  parentKey: string,
  tasks: string[],
  existingSummaries: Set<string>,
  assigneeAccountId: string | null,
): Promise<number> {
  let created = 0;
  for (const task of tasks) {
    const summary = typeof task === 'string' ? task.trim() : '';
    if (!summary) continue;
    const normalized = summary.toLowerCase();
    if (existingSummaries.has(normalized)) continue;
    existingSummaries.add(normalized);
    try {
      const resp = await fetch(`${baseUrl}/rest/api/3/issue`, {
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
      if (resp.ok) created++;
    } catch {
      // Ignore individual failures
    }
  }
  return created;
}

async function createJiraTestCases(
  baseUrl: string,
  authHeader: string,
  projectKey: string,
  parentKey: string,
  testCases: any[],
  issueType: string,
): Promise<number> {
  let created = 0;
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
      const createdIssue = await resp.json();
      created++;
      await fetch(`${baseUrl}/rest/api/3/issueLink`, {
        method: 'POST',
        headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: { name: 'Relates' },
          inwardIssue: { key: createdIssue.key },
          outwardIssue: { key: parentKey },
        }),
      });
    } catch {
      // Ignore linking failures
    }
  }
  return created;
}

async function createZephyrTestCases(
  baseUrl: string,
  zephyrAuthHeader: string,
  jiraAuthHeader: string,
  projectKey: string,
  parentKey: string,
  testCases: any[],
  testCaseIssueType?: string, // Optional - for fallback only
): Promise<{ errors: string[]; created: number; updated: number }> {
  // Zephyr Scale Cloud API v2 Integration
  // Zephyr Scale has its own separate API that requires a specific API token
  // API docs: https://support.smartbear.com/zephyr-scale-cloud/api-docs/
  
  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  const zephyrBaseUrl = 'https://api.zephyrscale.smartbear.com/v2';
  
  // Helper function to search for existing test case by name
  async function findExistingTestCase(testCaseName: string): Promise<string | null> {
    try {
      // Search for test cases in the project by name
      // Zephyr API: GET /testcases?projectKey={projectKey}&name={name}
      const searchUrl = `${zephyrBaseUrl}/testcases?projectKey=${encodeURIComponent(projectKey)}&name=${encodeURIComponent(testCaseName)}`;
      const searchResp = await fetch(searchUrl, {
        headers: {
          'Authorization': zephyrAuthHeader,
          'Accept': 'application/json'
        }
      });
      
      if (searchResp.ok) {
        const searchResult: any = await searchResp.json();
        // Check if we found an exact match
        if (searchResult.values && searchResult.values.length > 0) {
          const exactMatch = searchResult.values.find((tc: any) => 
            tc.name?.trim() === testCaseName.trim()
          );
          if (exactMatch) {
            return exactMatch.key;
          }
        }
      }
    } catch (e) {
      // If search fails, we'll just create a new one
      console.warn(`Failed to search for existing test case: ${e}`);
    }
    return null;
  }
  
  // Create test script for a test case using dedicated endpoint
  // POST /testcases/{testCaseKey}/testscript
  // Type must be lowercase: "plain" or "bdd"
  async function createTestScript(testCaseKey: string, scriptType: 'plain' | 'bdd', scriptText: string): Promise<boolean> {
    try {
      const resp = await fetch(`${zephyrBaseUrl}/testcases/${testCaseKey}/testscript`, {
        method: 'POST',
        headers: {
          'Authorization': zephyrAuthHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: scriptType,
          text: scriptText
        }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`Failed to create testScript for ${testCaseKey}: ${resp.status} - ${errorText.substring(0, 200)}`);
        return false;
      }
      
      console.log(`Created ${scriptType} testScript for ${testCaseKey}`);
      return true;
    } catch (e: any) {
      console.error(`Exception creating testScript for ${testCaseKey}: ${e.message}`);
      return false;
    }
  }
  
  async function linkTestCaseToIssue(testCaseKey: string, issueKey: string): Promise<boolean> {
    try {
      // Step 1: Get the Jira issue ID (numeric) from the issue key
      // Zephyr API requires the internal numeric ID, not the issue key
      const jiraIssueResp = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}`, {
        headers: {
          'Authorization': jiraAuthHeader,
          'Accept': 'application/json'
        }
      });
      
      if (!jiraIssueResp.ok) {
        console.warn(`Failed to get Jira issue details for ${issueKey}: ${jiraIssueResp.status}`);
        return false;
      }
      
      const jiraIssue: any = await jiraIssueResp.json();
      const issueId = jiraIssue.id; // This is the numeric ID Zephyr needs
      
      if (!issueId) {
        console.warn(`No issue ID found for ${issueKey}`);
        return false;
      }
      
      // Step 2: Link the test case to the Jira issue using Zephyr Scale API
      // Endpoint: POST /v2/testcases/{testCaseKey}/links/issues
      const linkResp = await fetch(`${zephyrBaseUrl}/testcases/${testCaseKey}/links/issues`, {
        method: 'POST',
        headers: {
          'Authorization': zephyrAuthHeader,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          issueId: parseInt(issueId, 10) // Ensure it's a number
        }),
      });
      
      if (linkResp.ok) {
        console.log(`Successfully linked Zephyr test case ${testCaseKey} to Jira issue ${issueKey} (ID: ${issueId})`);
        return true;
      } else if (linkResp.status === 409 || linkResp.status === 400) {
        // 409 Conflict or 400 might indicate link already exists
        const errorText = await linkResp.text();
        if (errorText.includes('already') || errorText.includes('exists') || errorText.includes('duplicate')) {
          console.log(`Test case ${testCaseKey} is already linked to ${issueKey}`);
          return true;
        }
        console.warn(`Failed to link test case ${testCaseKey} to ${issueKey}: ${errorText.substring(0, 200)}`);
        return false;
      } else {
        const errorText = await linkResp.text();
        console.warn(`Failed to link test case ${testCaseKey} to ${issueKey} (${linkResp.status}): ${errorText.substring(0, 200)}`);
        return false;
      }
    } catch (error: any) {
      console.error(`Failed to link test case to issue: ${error.message}`);
      return false;
    }
  }
  
  for (const tc of testCases) {
    let existingTestCaseKey: string | null = null;
    let testCaseKey: string | null = null;
    let wasUpdated = false;
    
    try {
      // Support both new format (name + bddScript) and legacy format (given/when/then)
      let testCaseName: string;
      let testCasePayload: any;
      
      // Check if new format exists (name and bddScript are present and non-empty)
      const hasNewFormat = tc.name !== undefined && tc.bddScript !== undefined && 
                          typeof tc.name === 'string' && tc.name.trim().length > 0 &&
                          typeof tc.bddScript === 'string' && tc.bddScript.trim().length > 0;
      
      if (hasNewFormat) {
        // New Zephyr format with name and BDD script
        testCaseName = tc.name;
        
        // Create test case first, then use separate endpoint for testScript
        testCasePayload = {
          projectKey: projectKey,
          name: testCaseName,
          objective: `Verify: ${testCaseName}`,
        };
      } else if (tc.given && tc.when && tc.then) {
        // Legacy format - create test case, then add steps via testscript endpoint
        testCaseName = `Given ${tc.given}, When ${tc.when}, Then ${tc.then}`;
        
        testCasePayload = {
          projectKey: projectKey,
          name: testCaseName,
          objective: `Verify: ${testCaseName}`,
        };
      } else {
        // Invalid format - skip
        console.warn('Invalid test case format, skipping:', JSON.stringify(tc, null, 2));
        errors.push(`Skipped test case with invalid format. Expected either {name, bddScript} or {given, when, then}. Got: ${JSON.stringify(tc)}`);
        continue;
      }
      
      console.log(`Processing Zephyr test case: "${testCaseName}"`);
      
      // Check if test case already exists
      existingTestCaseKey = await findExistingTestCase(testCaseName);
      
      if (existingTestCaseKey) {
        // Update existing test case - first fetch it to get required fields
        wasUpdated = true;
        console.log(`Updating existing Zephyr test case ${existingTestCaseKey}`);
        
        // Fetch existing test case to get required fields (status, priority, project, id, key)
        const getResp = await fetch(`${zephyrBaseUrl}/testcases/${existingTestCaseKey}`, {
          headers: {
            'Authorization': zephyrAuthHeader,
            'Accept': 'application/json'
          }
        });
        
        if (!getResp.ok) {
          const errorText = await getResp.text();
          errors.push(
            `Failed to fetch existing Zephyr test case "${testCaseName}" for update (${getResp.status}): ${errorText.substring(0, 300)}`
          );
          continue;
        }
        
        const existingTestCase: any = await getResp.json();
        
        // Build update payload with required fields from existing test case
        const updatePayload = {
          ...testCasePayload,
          id: existingTestCase.id,
          key: existingTestCase.key,
          status: existingTestCase.status || { name: 'Draft' },
          priority: existingTestCase.priority || { name: 'Medium' },
          project: existingTestCase.project || { key: projectKey },
        };
        
        const updateResp = await fetch(`${zephyrBaseUrl}/testcases/${existingTestCaseKey}`, {
          method: 'PUT',
          headers: {
            'Authorization': zephyrAuthHeader,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatePayload),
        });
        
        if (!updateResp.ok) {
          const errorText = await updateResp.text();
          errors.push(
            `Failed to update Zephyr test case "${testCaseName}" (${updateResp.status}): ${errorText.substring(0, 300)}`
          );
          console.error(`Zephyr API update error response:`, errorText);
          continue;
        }
        
        // Handle response - PUT may return 200 with body or 204 with no body
        let updatedTestCase: any = null;
        const responseText = await updateResp.text();
        if (responseText && responseText.trim()) {
          try {
            updatedTestCase = JSON.parse(responseText);
          } catch (e) {
            // Ignore parse errors for empty responses
          }
        }
        
        testCaseKey = updatedTestCase?.key || existingTestCaseKey;
        console.log(`Updated Zephyr test case ${testCaseKey}`);
        
        // Create/update test script using dedicated endpoint
        if (testCaseKey) {
          if (hasNewFormat && tc.bddScript) {
            const scriptCreated = await createTestScript(testCaseKey, 'bdd', tc.bddScript.trim());
            if (!scriptCreated) {
              errors.push(`Warning: Test case ${testCaseKey} was updated but BDD script could not be set.`);
            }
          } else if (tc.given && tc.when && tc.then) {
            // For legacy format, use plain text with formatted steps
            const plainScript = `Given ${tc.given}\nWhen ${tc.when}\nThen ${tc.then}`;
            const scriptCreated = await createTestScript(testCaseKey, 'plain', plainScript);
            if (!scriptCreated) {
              errors.push(`Warning: Test case ${testCaseKey} was updated but test script could not be set.`);
            }
          }
        }
        updated++;
      } else {
        // Create new test case
        wasUpdated = false;
        const createResp = await fetch(`${zephyrBaseUrl}/testcases`, {
          method: 'POST',
          headers: {
            'Authorization': zephyrAuthHeader,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(testCasePayload),
        });
        
        if (!createResp.ok) {
          const errorText = await createResp.text();
          errors.push(
            `Failed to create Zephyr test case "${testCaseName}" (${createResp.status}): ${errorText.substring(0, 300)}`
          );
          console.error(`Zephyr API error response:`, errorText);
          continue;
        }
        
        const createdTestCase: any = await createResp.json();
        testCaseKey = createdTestCase.key;
        console.log(`Created Zephyr test case ${testCaseKey}`);
        
        // Create test script using dedicated endpoint
        if (testCaseKey) {
          if (hasNewFormat && tc.bddScript) {
            const scriptCreated = await createTestScript(testCaseKey, 'bdd', tc.bddScript.trim());
            if (!scriptCreated) {
              errors.push(`Warning: Test case ${testCaseKey} was created but BDD script could not be set.`);
            }
          } else if (tc.given && tc.when && tc.then) {
            // For legacy format, use plain text with formatted steps
            const plainScript = `Given ${tc.given}\nWhen ${tc.when}\nThen ${tc.then}`;
            const scriptCreated = await createTestScript(testCaseKey, 'plain', plainScript);
            if (!scriptCreated) {
              errors.push(`Warning: Test case ${testCaseKey} was created but test script could not be set.`);
            }
          }
        }
        
        created++;
      }
      
      // Ensure the test case is linked to the parent story
      if (parentKey && testCaseKey) {
        const linked = await linkTestCaseToIssue(testCaseKey, parentKey);
        if (!linked) {
          errors.push(
            `Warning: Test case ${testCaseKey} was ${wasUpdated ? 'updated' : 'created'} but could not be linked to ${parentKey}. ` +
            `You may need to link it manually in Jira.`
          );
        }
      }
    } catch (error: any) {
      errors.push(`Exception ${wasUpdated ? 'updating' : 'creating'} Zephyr test case: ${error.message || String(error)}`);
      console.error(`Failed to ${wasUpdated ? 'update' : 'create'} Zephyr test case:`, error);
    }
  }
  
  return { errors, created, updated };
}

function buildJiraDescriptionDoc(
  enhanced: any, 
  after: any, 
  excludeAcceptanceCriteria: boolean = false,
  excludeTestCases: boolean = false
) {
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
  
  // Only include Acceptance Criteria if not excluded
  if (!excludeAcceptanceCriteria) {
    const acceptanceItems = collectAcceptanceItems(enhanced, after);
    if (acceptanceItems.length) {
      pushHeading('Acceptance Criteria');
      pushList(acceptanceItems);
    }
  }
  
  // Only include Test Cases if not excluded
  if (!excludeTestCases) {
    const formattedTestCases = collectTestCaseItems(enhanced);
    if (formattedTestCases.length) {
      pushHeading('Test Cases');
      pushList(formattedTestCases);
    }
  }
  
  const descriptionText =
    enhanced.descriptionText || stripHtml(after.descriptionHtml || '');
  if (descriptionText) {
    descriptionText
      .split(/\n+/)
      .map((line: string) => line.trim())
      .filter(Boolean)
      .forEach((line: string) => pushParagraph(line));
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

function buildAdfBulletList(items: string[]): any {
  // Build an ADF document with a bullet list
  // This is required for Jira custom fields that are rich text fields
  if (!items || items.length === 0) {
    return {
      version: 1,
      type: 'doc',
      content: [],
    };
  }
  
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: items.map((item) => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: item }],
            },
          ],
        })),
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
  // Prioritize array from enhanced data (which may include overrides)
  if (Array.isArray(enhanced?.acceptanceCriteria) && enhanced.acceptanceCriteria.length > 0) {
    return enhanced.acceptanceCriteria.filter((ac: any) => typeof ac === 'string' && ac.trim().length > 0);
  }
  // Fall back to parsing HTML override if no array
  if (after?._overrideAcceptance) {
    const overrides = extractListFromHtml(after._overrideAcceptance);
    if (overrides.length) return overrides;
  }
  return [];
}

function collectTestCaseItems(enhanced: any): string[] {
  if (!Array.isArray(enhanced?.testCases) || enhanced.testCases.length === 0) return [];
  return enhanced.testCases
    .map((tc: any) => {
      if (!tc || typeof tc !== 'object') return null;
      // Strip "Given", "When", "Then" prefixes to avoid duplication when formatting
      let given = typeof tc.given === 'string' ? tc.given.trim() : '';
      let when = typeof tc.when === 'string' ? tc.when.trim() : '';
      let then = typeof tc.then === 'string' ? tc.then.trim() : '';
      // Remove prefixes if present
      given = given.replace(/^Given\s+/i, '').trim();
      when = when.replace(/^When\s+/i, '').trim();
      then = then.replace(/^Then\s+/i, '').trim();
      if (!given && !when && !then) return null;
      return `Given ${given}, When ${when}, Then ${then}`.replace(/\s+,/g, ',').trim();
    })
    .filter((entry: string | null): entry is string => typeof entry === 'string' && entry.length > 0);
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
        const italicMarker: { start: number; end: number; type: 'bold' | 'italic'; length: number } = { start: italicStart, end: italicEnd, type: 'italic', length: 1 };
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
