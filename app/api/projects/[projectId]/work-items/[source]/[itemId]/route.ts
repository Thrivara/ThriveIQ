import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';
import { decryptString } from 'lib/crypto';

export async function GET(_req: Request, { params }: { params: { projectId: string, source: string, itemId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  if (params.source !== 'ado') return NextResponse.json({ message: 'Source not implemented' }, { status: 400 });

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('type', 'azure_devops')
    .eq('is_active', true)
    .maybeSingle();
  const { data: secret } = await supabase
    .from('secrets')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('provider', 'azure_devops')
    .maybeSingle();
  if (!integration || !secret) return NextResponse.json({ message: 'ADO integration/secret missing' }, { status: 400 });

  let patRaw = secret.encrypted_value as string;
  if (process.env.APP_ENCRYPTION_KEY) patRaw = decryptString(patRaw);
  const creds = typeof patRaw === 'string' ? JSON.parse(patRaw) : patRaw;
  const organization = (integration.metadata as any)?.organization || creds.organization;
  const project = (integration.metadata as any)?.project || creds.project;
  const pat = creds.personalAccessToken;
  const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');
  const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workitems/${encodeURIComponent(params.itemId)}?api-version=7.1`;

  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: authHeader, Accept: 'application/json', 'X-TFS-FedAuthRedirect': 'Suppress', 'User-Agent': 'ThriveIQ/1.0'
      }
    });
    const txt = await resp.text();
    if (!resp.ok) return NextResponse.json({ message: `ADO error: ${resp.status} ${txt.slice(0,200)}` }, { status: 400 });
    const json: any = JSON.parse(txt);
    const f = json.fields || {};
    const bodyHtml = (f['System.Description'] || '').toString();
    const acHtml = (f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '').toString();
    return NextResponse.json({
      id: json.id,
      title: f['System.Title'] || '',
      state: f['System.State'] || '',
      type: f['System.WorkItemType'] || '',
      assignedTo: f['System.AssignedTo']?.displayName || null,
      changedDate: f['System.ChangedDate'] || null,
      descriptionHtml: bodyHtml,
      acceptanceCriteriaHtml: acHtml,
      link: `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_workitems/edit/${json.id}`,
      source: 'ado'
    });
  } catch (e: any) {
    return NextResponse.json({ message: `Network error: ${e.message}` }, { status: 500 });
  }
}
