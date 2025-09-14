import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import { decryptString } from '@/../lib/crypto';

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
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
  if (!integration) return NextResponse.json({ items: [] });

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

  const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
  const wiql = `Select [System.Id] From WorkItems Where [System.TeamProject] = @project Order By [System.ChangedDate] DESC`;
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
    const ids: number[] = (wiqlJson?.workItems || []).slice(0, 50).map((w: any) => w.id);
    if (ids.length === 0) return NextResponse.json({ items: [] });

    const detailResp = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-TFS-FedAuthRedirect': 'Suppress',
        'User-Agent': 'ThriveIQ/1.0'
      },
      body: JSON.stringify({ ids, fields: [
        'System.Id', 'System.Title', 'System.State', 'System.WorkItemType', 'System.AssignedTo', 'System.ChangedDate'
      ] })
    });
    const detailText = await detailResp.text();
    if (!detailResp.ok) return NextResponse.json({ message: `ADO batch error: ${detailResp.status} ${detailText.slice(0,200)}` }, { status: 400 });
    const detailJson: any = JSON.parse(detailText);
    const items = (detailJson?.value || []).map((w: any) => ({
      id: w.id,
      title: w.fields?.['System.Title'],
      state: w.fields?.['System.State'],
      type: w.fields?.['System.WorkItemType'],
      assignedTo: w.fields?.['System.AssignedTo']?.displayName ?? null,
      changedDate: w.fields?.['System.ChangedDate'] ?? null,
    }));
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ message: `Network error: ${e.message}` }, { status: 500 });
  }
}

