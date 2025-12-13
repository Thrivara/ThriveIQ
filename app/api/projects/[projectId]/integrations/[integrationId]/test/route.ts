import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';
import { decryptString } from 'lib/crypto';
import { enforceSingleActiveTracker, isTrackerIntegration } from 'lib/integrations';

export async function POST(_req: Request, { params }: { params: { projectId: string; integrationId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Fetch integration
  const { data: integration, error: intErr } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', params.integrationId)
    .single();
  if (intErr || !integration) return NextResponse.json({ success: false, message: 'Integration not found' }, { status: 404 });

  const provider = integration.type === 'jira' ? 'jira' : 'azure_devops';
  const { data: secret, error: secErr } = await supabase
    .from('secrets')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('provider', provider)
    .maybeSingle();
  if (secErr || !secret) {
    return NextResponse.json({ success: false, message: `${integration.type === 'jira' ? 'Jira' : 'Azure DevOps'} credentials not found` }, { status: 400 });
  }

  let decrypted = secret.encrypted_value as string;
  try {
    if (process.env.APP_ENCRYPTION_KEY) {
      decrypted = decryptString(decrypted);
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, message: `Decrypt failed: ${e.message}` }, { status: 500 });
  }
  const creds = typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;

  if (integration.type === 'jira') {
    const baseUrl = (integration.metadata as any)?.baseUrl || creds.baseUrl;
    const email = creds.email;
    const apiToken = creds.apiToken;
    const projectKey = (integration.metadata as any)?.projectKey;
    if (!baseUrl || !email || !apiToken) {
      return NextResponse.json({ success: false, message: 'Missing Jira base URL, email, or API token' }, { status: 400 });
    }
    const authHeader = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
    const projectUrl = projectKey
      ? `${baseUrl}/rest/api/3/project/${encodeURIComponent(projectKey)}`
      : `${baseUrl}/rest/api/3/myself`;
    try {
      const resp = await fetch(projectUrl, {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });
      const raw = await resp.text();
      if (!resp.ok) {
        return NextResponse.json({ success: false, message: `Jira error: ${resp.status} ${raw.slice(0, 200)}` }, { status: 400 });
      }
      await supabase
        .from('integrations')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', params.integrationId)
        .eq('project_id', params.projectId);
      if (isTrackerIntegration(integration.type)) {
        await enforceSingleActiveTracker(supabase, params.projectId, integration.id);
      }
      return NextResponse.json({ success: true, message: 'Connection successful' });
    } catch (e: any) {
      return NextResponse.json({ success: false, message: `Network error: ${e.message}` }, { status: 500 });
    }
  } else {
    const organization = (integration.metadata as any)?.organization || creds.organization;
    const personalAccessToken = creds.personalAccessToken;
    if (!organization || !personalAccessToken) {
      return NextResponse.json({ success: false, message: 'Missing organization or PAT' }, { status: 400 });
    }
    const authHeader = 'Basic ' + Buffer.from(':' + personalAccessToken).toString('base64');
    const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects?api-version=7.1-preview.4`;
    try {
      const resp = await fetch(url, {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'X-TFS-FedAuthRedirect': 'Suppress',
          'User-Agent': 'ThriveIQ/1.0'
        }
      });
      const raw = await resp.text();
      if (!resp.ok) {
        return NextResponse.json({ success: false, message: `Azure DevOps error: ${resp.status} ${raw}` }, { status: 400 });
      }
      let json: any = null;
      try { json = JSON.parse(raw); } catch {}
      const projects = Array.isArray(json?.value) ? json.value.slice(0, 3) : [];
      await supabase
        .from('integrations')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', params.integrationId)
        .eq('project_id', params.projectId);
      if (isTrackerIntegration(integration.type)) {
        await enforceSingleActiveTracker(supabase, params.projectId, integration.id);
      }
      return NextResponse.json({ success: true, message: 'Connection successful', projects });
    } catch (e: any) {
      return NextResponse.json({ success: false, message: `Network error: ${e.message}` }, { status: 500 });
    }
  }
}
