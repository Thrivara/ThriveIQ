import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';
import { decryptString } from 'lib/crypto';

export async function GET(req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // Find an active Azure DevOps integration
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('type', 'azure_devops')
    .eq('is_active', true)
    .maybeSingle();
  if (!integration) {
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
    .eq('provider', 'azure_devops')
    .maybeSingle();
  if (!secret) return NextResponse.json({ message: 'Azure DevOps credentials not found' }, { status: 400 });

  let patRaw = secret.encrypted_value as string;
  if (process.env.APP_ENCRYPTION_KEY) patRaw = decryptString(patRaw);
  const creds = typeof patRaw === 'string' ? JSON.parse(patRaw) : patRaw;
  const organization = (integration.metadata as any)?.organization || creds.organization;
  const project = (integration.metadata as any)?.project || creds.project;
  const pat = creds.personalAccessToken;
  if (!organization || !project || !pat) return NextResponse.json({ message: 'Incomplete Azure DevOps credentials' }, { status: 400 });

  const urlObj = new URL(req.url);
  const page = Math.max(1, parseInt(urlObj.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(urlObj.searchParams.get('pageSize') || '25', 10)));
  const q = (urlObj.searchParams.get('q') || '').trim();
  const sortBy = (urlObj.searchParams.get('sortBy') || 'ChangedDate');
  const sortDir = (urlObj.searchParams.get('sortDir') || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const types = urlObj.searchParams.getAll('type');
  const states = urlObj.searchParams.getAll('state');
  const assigned = urlObj.searchParams.getAll('assignedTo');
  const iterations = urlObj.searchParams.getAll('iteration');
  const areas = urlObj.searchParams.getAll('area');
  const tags = urlObj.searchParams.getAll('tag');

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
          id: w.id,
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
