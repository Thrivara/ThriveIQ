import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';
import { decryptString } from 'lib/crypto';

export async function GET(_req: Request, { params }: { params: { projectId: string, source: string, itemId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const sourceMap: Record<string, 'azure_devops' | 'jira'> = { ado: 'azure_devops', jira: 'jira' };
  const provider = sourceMap[params.source];
  if (!provider) return NextResponse.json({ message: 'Source not implemented' }, { status: 400 });

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('type', provider)
    .eq('is_active', true)
    .maybeSingle();
  const { data: secret } = await supabase
    .from('secrets')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('provider', provider)
    .maybeSingle();
  if (!integration || !secret) {
    return NextResponse.json(
      { message: `${provider === 'jira' ? 'Jira' : 'Azure DevOps'} integration/secret missing` },
      { status: 400 },
    );
  }

  let decrypted = secret.encrypted_value as string;
  if (process.env.APP_ENCRYPTION_KEY) decrypted = decryptString(decrypted);
  const creds = typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;

  if (provider === 'jira') {
    const baseUrl = (integration.metadata as any)?.baseUrl || creds.baseUrl;
    const projectKey = (integration.metadata as any)?.projectKey;
    const email = creds.email;
    const apiToken = creds.apiToken;
    if (!baseUrl || !email || !apiToken) {
      return NextResponse.json({ message: 'Incomplete Jira credentials' }, { status: 400 });
    }
    const authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
    const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(params.itemId)}?expand=renderedFields`;
    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });
      const txt = await resp.text();
      if (!resp.ok) {
        return NextResponse.json({ message: `Jira error: ${resp.status} ${txt.slice(0, 200)}` }, { status: 400 });
      }
      const json: any = JSON.parse(txt);
      const fields = json.fields || {};
      const rendered = json.renderedFields || {};
      return NextResponse.json({
        id: json.id,
        title: fields.summary || '',
        state: fields.status?.name || '',
        type: fields.issuetype?.name || '',
        assignedTo: fields.assignee?.displayName || null,
        changedDate: fields.updated || null,
        descriptionHtml: rendered.description || '',
        acceptanceCriteriaHtml: '',
        link: `${baseUrl.replace(/\/$/, '')}/browse/${json.key || params.itemId}`,
        source: 'jira'
      });
    } catch (e: any) {
      return NextResponse.json({ message: `Network error: ${e.message}` }, { status: 500 });
    }
  } else {
    const organization = (integration.metadata as any)?.organization || creds.organization;
    const project = (integration.metadata as any)?.project || creds.project;
    const pat = creds.personalAccessToken;
    if (!organization || !project || !pat) {
      return NextResponse.json({ message: 'Incomplete Azure DevOps credentials' }, { status: 400 });
    }
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
}
