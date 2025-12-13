import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';
import { decryptString } from 'lib/crypto';
import { isTrackerIntegration } from 'lib/integrations';

type TrackerQueryState = {
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: 'ASC' | 'DESC';
  q: string;
  types: string[];
  states: string[];
  assigned: string[];
  iterations: string[];
  areas: string[];
  tags: string[];
};

export async function GET(req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('is_active', true)
    .maybeSingle();
  if (!integration || !isTrackerIntegration(integration.type)) {
    return NextResponse.json({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
      filters: { types: [], states: [], assignedTo: [], iterations: [], areas: [], tags: [] },
    });
  }

  // Get secret (PAT)
  const { data: secret } = await supabase
    .from('secrets')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('provider', integration.type)
    .maybeSingle();
  if (!secret) {
    return NextResponse.json(
      { message: `${integration.type === 'jira' ? 'Jira' : 'Azure DevOps'} credentials not found` },
      { status: 400 },
    );
  }

  let decryptedSecret = secret.encrypted_value as string;
  if (process.env.APP_ENCRYPTION_KEY) decryptedSecret = decryptString(decryptedSecret);
  const creds = typeof decryptedSecret === 'string' ? JSON.parse(decryptedSecret) : decryptedSecret;

  const urlObj = new URL(req.url);
  const page = Math.max(1, parseInt(urlObj.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(urlObj.searchParams.get('pageSize') || '25', 10)));
  const q = (urlObj.searchParams.get('q') || '').trim();
  const sortBy = (urlObj.searchParams.get('sortBy') || 'ChangedDate');
  const sortDir: 'ASC' | 'DESC' = (urlObj.searchParams.get('sortDir') || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const types = urlObj.searchParams.getAll('type');
  const states = urlObj.searchParams.getAll('state');
  const assigned = urlObj.searchParams.getAll('assignedTo');
  const iterations = urlObj.searchParams.getAll('iteration');
  const areas = urlObj.searchParams.getAll('area');
  const tags = urlObj.searchParams.getAll('tag');

  const queryState = {
    page,
    pageSize,
    sortBy,
    sortDir,
    q,
    types,
    states,
    assigned,
    iterations,
    areas,
    tags,
  };

  if (integration.type === 'jira') {
    return handleJiraWorkItems({
      integration,
      creds,
      query: queryState,
    });
  }

  const organization = (integration.metadata as any)?.organization || creds.organization;
  const project = (integration.metadata as any)?.project || creds.project;
  const pat = creds.personalAccessToken;
  if (!organization || !project || !pat) {
    return NextResponse.json({ message: 'Incomplete Azure DevOps credentials' }, { status: 400 });
  }

  const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
  const esc = (s: string) => s.replace(/'/g, "''").replace(/\\/g, '\\\\');
  const clauses: string[] = ["[System.TeamProject] = @project"]; 
  if (q) clauses.push(`[System.Title] CONTAINS '${esc(q)}'`);
  if (types.length) clauses.push(`[System.WorkItemType] IN (${types.map(t=>`'${esc(t)}'`).join(', ')})`);
  if (states.length) clauses.push(`[System.State] IN (${states.map(s=>`'${esc(s)}'`).join(', ')})`);
  if (assigned.length) {
    const assignedClauses = assigned.map((name) =>
      name === 'Unassigned'
        ? "[System.AssignedTo] = ''"
        : `[System.AssignedTo] = '${esc(name)}'`,
    );
    clauses.push(`(${assignedClauses.join(' OR ')})`);
  }
  if (iterations.length) clauses.push(`[System.IterationPath] IN (${iterations.map(it=>`'${esc(it)}'`).join(', ')})`);
  if (areas.length) {
    const areaClauses = areas.map((area) => `([System.AreaPath] = '${esc(area)}' OR [System.AreaPath] UNDER '${esc(area)}')`);
    clauses.push(`(${areaClauses.join(' OR ')})`);
  }
  if (tags.length) {
    const tagClauses = tags.map((tag) => `[System.Tags] CONTAINS '${esc(tag)}'`);
    clauses.push(`(${tagClauses.join(' OR ')})`);
  }
  const orderField = sortBy === 'Title' ? 'System.Title' : sortBy === 'State' ? 'System.State' : sortBy === 'Type' ? 'System.WorkItemType' : 'System.ChangedDate';
  const wiql = `Select [System.Id] From WorkItems Where ${clauses.join(' AND ')} Order By [${orderField}] ${sortDir}`;
  const wiqlUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.1`;
  const batchUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workitemsbatch?api-version=7.1`;

  try {
    const wiqlResp = await fetch(wiqlUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-TFS-FedAuthRedirect': 'Suppress',
        'User-Agent': 'ThriveIQ/1.0'
      },
      body: JSON.stringify({ query: wiql })
    });
    const wiqlText = await wiqlResp.text();
    if (!wiqlResp.ok) return NextResponse.json({ message: `ADO WIQL error: ${wiqlResp.status} ${wiqlText.slice(0,200)}` }, { status: 400 });
    const wiqlJson: any = JSON.parse(wiqlText);
    const allIds: number[] = (wiqlJson?.workItems || []).map((w: any) => w.id);
    const total = allIds.length;
    const start = (page - 1) * pageSize;
    const ids = allIds.slice(start, start + pageSize);
    if (ids.length === 0) {
      return NextResponse.json({
        items: [],
        total,
        page,
        pageSize,
        filters: { types: [], states: [], assignedTo: [], iterations: [], areas: [], tags: [] },
      });
    }

    const facetFields = [
      'System.WorkItemType',
      'System.State',
      'System.AssignedTo',
      'System.IterationPath',
      'System.AreaPath',
      'System.Tags',
    ];

    const facetResults: any[] = [];
    if (allIds.length) {
      for (let i = 0; i < allIds.length; i += 200) {
        const chunkIds = allIds.slice(i, i + 200);
        const facetResp = await fetch(batchUrl, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-TFS-FedAuthRedirect': 'Suppress',
            'User-Agent': 'ThriveIQ/1.0',
          },
          body: JSON.stringify({ ids: chunkIds, fields: facetFields }),
        });
        const facetText = await facetResp.text();
        if (!facetResp.ok) {
          return NextResponse.json({ message: `ADO facet batch error: ${facetResp.status} ${facetText.slice(0, 200)}` }, { status: 400 });
        }
        const facetJson: any = JSON.parse(facetText);
        facetResults.push(...(facetJson?.value || []));
      }
    }

    const typeSet = new Set<string>();
    const stateSet = new Set<string>();
    const assignedSet = new Set<string>();
    const iterationSet = new Set<string>();
    const areaSet = new Set<string>();
    const tagSet = new Set<string>();

    const normalizeAssigned = (value: any) => {
      if (!value) return 'Unassigned';
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        return value?.displayName || value?.uniqueName || 'Unassigned';
      }
      return 'Unassigned';
    };

    facetResults.forEach((entry) => {
      const fields = entry?.fields || {};
      const type = (fields['System.WorkItemType'] || '').toString().trim();
      if (type) typeSet.add(type);
      const state = (fields['System.State'] || '').toString().trim();
      if (state) stateSet.add(state);
      const assignedName = normalizeAssigned(fields['System.AssignedTo']);
      if (assignedName) assignedSet.add(assignedName);
      const iteration = (fields['System.IterationPath'] || '').toString().trim();
      if (iteration) iterationSet.add(iteration);
      const area = (fields['System.AreaPath'] || '').toString().trim();
      if (area) areaSet.add(area);
      const tagsRaw = (fields['System.Tags'] || '').toString();
      if (tagsRaw) {
        tagsRaw
          .split(';')
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag.length > 0)
          .forEach((tag: string) => tagSet.add(tag));
      }
    });

    if (!assignedSet.size) {
      assignedSet.add('Unassigned');
    }

    const detailResp = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-TFS-FedAuthRedirect': 'Suppress',
        'User-Agent': 'ThriveIQ/1.0',
      },
      body: JSON.stringify({
        ids,
        fields: [
          'System.Id',
          'System.Title',
          'System.Description',
          'System.State',
          'System.WorkItemType',
          'System.AssignedTo',
          'System.ChangedDate',
          'System.IterationPath',
          'System.AreaPath',
          'System.Tags',
        ],
      }),
    });
    const detailText = await detailResp.text();
    if (!detailResp.ok) return NextResponse.json({ message: `ADO batch error: ${detailResp.status} ${detailText.slice(0,200)}` }, { status: 400 });
    const detailJson: any = JSON.parse(detailText);

    const detailLookup = new Map<number, any>();
    (detailJson?.value || []).forEach((entry: any) => {
      detailLookup.set(entry?.id, entry);
    });

    const items = ids
      .map((workItemId) => {
        const w = detailLookup.get(workItemId);
        if (!w) return null;
        const tagsValue = (w.fields?.['System.Tags'] || '')
          .toString()
          .split(';')
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag.length > 0);
        return {
          id: String(w.id),
          title: w.fields?.['System.Title'],
          state: w.fields?.['System.State'],
          type: w.fields?.['System.WorkItemType'],
          assignedTo: w.fields?.['System.AssignedTo']?.displayName ?? w.fields?.['System.AssignedTo'] ?? 'Unassigned',
          changedDate: w.fields?.['System.ChangedDate'] ?? null,
          iterationPath: w.fields?.['System.IterationPath'] ?? null,
          areaPath: w.fields?.['System.AreaPath'] ?? null,
          tags: tagsValue,
          descriptionPreview: (w.fields?.['System.Description'] || '').toString().replace(/<[^>]+>/g,'').slice(0,160),
          source: 'ado',
          links: { html: `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_workitems/edit/${w.id}` },
        };
      })
      .filter(Boolean);

    const filters = {
      types: Array.from(typeSet).sort((a, b) => a.localeCompare(b)),
      states: Array.from(stateSet).sort((a, b) => a.localeCompare(b)),
      assignedTo: Array.from(assignedSet).sort((a, b) => a.localeCompare(b)),
      iterations: Array.from(iterationSet).sort((a, b) => a.localeCompare(b)),
      areas: Array.from(areaSet).sort((a, b) => a.localeCompare(b)),
      tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
    };

    return NextResponse.json({ items, total, page, pageSize, filters });
  } catch (e: any) {
    return NextResponse.json({ message: `Network error: ${e.message}` }, { status: 500 });
  }
}

async function handleJiraWorkItems({
  integration,
  creds,
  query,
}: {
  integration: any;
  creds: any;
  query: TrackerQueryState;
}) {
  const baseUrl = (integration.metadata as any)?.baseUrl || creds.baseUrl;
  const projectKey = (integration.metadata as any)?.projectKey;
  const email = creds.email;
  const apiToken = creds.apiToken;
  const sprintFieldId = (integration.metadata as any)?.sprintFieldId;
  if (!baseUrl || !projectKey || !email || !apiToken) {
    return NextResponse.json({ message: 'Incomplete Jira credentials' }, { status: 400 });
  }
  const authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
  const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const clauses = [`project = "${esc(projectKey)}"`];
  if (query.q) {
    clauses.push(`text ~ "${esc(query.q)}"`);
  }
  if (query.types.length) {
    clauses.push(`issuetype in (${query.types.map((t) => `"${esc(t)}"`).join(', ')})`);
  }
  if (query.states.length) {
    clauses.push(`status in (${query.states.map((s) => `"${esc(s)}"`).join(', ')})`);
  }
  if (query.assigned.length) {
    const assignedClauses: string[] = [];
    const withNames = query.assigned.filter((name) => name !== 'Unassigned');
    if (withNames.length) {
      assignedClauses.push(`assignee in (${withNames.map((name) => `"${esc(name)}"`).join(', ')})`);
    }
    if (query.assigned.includes('Unassigned')) {
      assignedClauses.push('assignee is EMPTY');
    }
    if (assignedClauses.length) {
      clauses.push(`(${assignedClauses.join(' OR ')})`);
    }
  }
  if (query.iterations.length) {
    clauses.push(`Sprint in (${query.iterations.map((value) => `"${esc(value)}"`).join(', ')})`);
  }
  if (query.areas.length) {
    clauses.push(`component in (${query.areas.map((value) => `"${esc(value)}"`).join(', ')})`);
  }
  if (query.tags.length) {
    clauses.push(`labels in (${query.tags.map((value) => `"${esc(value)}"`).join(', ')})`);
  }
  const orderField = getJiraSortField(query.sortBy);
  const jql = `${clauses.join(' AND ')} ORDER BY ${orderField} ${query.sortDir}`;
  const startAt = Math.max(0, (query.page - 1) * query.pageSize);
  const searchUrl = new URL(`${baseUrl}/rest/api/3/search/jql`);
  searchUrl.searchParams.set('jql', jql);
  searchUrl.searchParams.set('startAt', String(startAt));
  searchUrl.searchParams.set('maxResults', String(Math.min(query.pageSize, 100)));
  const jiraFields = [
    'summary',
    'status',
    'issuetype',
    'assignee',
    'updated',
    'components',
    'labels',
    'description',
    'parent',
    'priority',
    'customfield_10020',
  ];
  jiraFields.forEach((field) => searchUrl.searchParams.append('fields', field));
  searchUrl.searchParams.append('expand', 'renderedFields');

  let response: Response;
  try {
    response = await fetch(searchUrl.toString(), {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ message: `Network error: ${e.message}` }, { status: 500 });
  }
  const raw = await response.text();
  if (!response.ok) {
    return NextResponse.json({ message: `Jira error: ${response.status} ${raw.slice(0, 200)}` }, { status: 400 });
  }
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: 'Jira returned invalid JSON' }, { status: 500 });
  }
  const issues: any[] = Array.isArray(json?.issues) ? json.issues : [];
  const total = typeof json?.total === 'number' ? json.total : issues.length;
  const typeSet = new Set<string>();
  const stateSet = new Set<string>();
  const assignedSet = new Set<string>();
  const iterationSet = new Set<string>();
  const areaSet = new Set<string>();
  const tagSet = new Set<string>();
  assignedSet.add('Unassigned');

  const items = issues.map((issue: any) => {
    const fields = issue.fields || {};
    const title = (fields.summary || '').toString();
    const type = fields.issuetype?.name || '';
    const state = fields.status?.name || '';
    const assignedTo = fields.assignee?.displayName || 'Unassigned';
    const sprintName = readSprintName(fields, sprintFieldId);
    const components = Array.isArray(fields.components) ? fields.components : [];
    const area = components.length ? components.map((c: any) => c?.name).filter(Boolean).join(', ') || null : null;
    const labels = Array.isArray(fields.labels) ? fields.labels.filter(Boolean) : [];
    const preview = adfToPlainText(fields.description).slice(0, 160);

    if (type) typeSet.add(type);
    if (state) stateSet.add(state);
    if (assignedTo) assignedSet.add(assignedTo);
    if (sprintName) iterationSet.add(sprintName);
    components.forEach((comp: any) => {
      if (comp?.name) {
        areaSet.add(comp.name);
      }
    });
    labels.forEach((label: string) => {
      if (label) tagSet.add(label);
    });

    return {
      id: issue.key,
      key: issue.key,
      title,
      state,
      type,
      assignedTo,
      changedDate: fields.updated ?? null,
      iterationPath: sprintName ?? null,
      areaPath: area,
      tags: labels,
      descriptionPreview: preview,
      source: 'jira',
      links: { html: `${baseUrl.replace(/\/$/, '')}/browse/${issue.key}` },
    };
  });

  const filters = {
    types: Array.from(typeSet).sort((a, b) => a.localeCompare(b)),
    states: Array.from(stateSet).sort((a, b) => a.localeCompare(b)),
    assignedTo: Array.from(assignedSet).sort((a, b) => a.localeCompare(b)),
    iterations: Array.from(iterationSet).sort((a, b) => a.localeCompare(b)),
    areas: Array.from(areaSet).sort((a, b) => a.localeCompare(b)),
    tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
  };

  return NextResponse.json({
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    filters,
  });
}

function getJiraSortField(sortBy: string) {
  switch (sortBy) {
    case 'Title':
      return 'summary';
    case 'State':
      return 'status';
    case 'Type':
      return 'issuetype';
    default:
      return 'updated';
  }
}

function adfToPlainText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToPlainText).join(' ');
  if (typeof node === 'object') {
    if (node.type === 'text') return node.text || '';
    if (Array.isArray(node.content)) {
      return node.content.map(adfToPlainText).join(' ');
    }
  }
  return '';
}

function readSprintName(fields: Record<string, any>, sprintFieldId?: string): string | null {
  const value =
    (sprintFieldId ? fields[sprintFieldId] : null) ??
    fields.sprint ??
    fields.customfield_10020 ??
    null;
  if (!value) return null;
  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    if (typeof last === 'string') {
      const name = /name=([^,]+)/.exec(last);
      return name ? name[1] : last;
    }
    return last?.name ?? null;
  }
  if (typeof value === 'object') {
    return value?.name ?? null;
  }
  if (typeof value === 'string') {
    const match = /name=([^,]+)/.exec(value);
    return match ? match[1] : value;
  }
  return null;
}
