import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import { decryptString } from '@/../lib/crypto';

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

  // Fetch secret (Azure DevOps PAT)
  const { data: secret, error: secErr } = await supabase
    .from('secrets')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('provider', 'azure_devops')
    .single();
  if (secErr || !secret) return NextResponse.json({ success: false, message: 'Azure DevOps credentials not found' }, { status: 400 });

  let patRaw = secret.encrypted_value as string;
  try {
    if (process.env.APP_ENCRYPTION_KEY) {
      patRaw = decryptString(patRaw);
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, message: `Decrypt failed: ${e.message}` }, { status: 500 });
  }

  // Secret payload stored is JSON string per UI
  const creds = typeof patRaw === 'string' ? JSON.parse(patRaw) : patRaw;
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
    try { json = JSON.parse(raw); } catch { /* some ADO responses may be HTML on failures */ }
    if (!json) {
      return NextResponse.json({ success: false, message: `Azure DevOps returned non-JSON: ${raw.slice(0, 200)}` }, { status: 400 });
    }
    const projects = Array.isArray(json?.value) ? json.value.slice(0, 3) : [];
    // Mark integration active on successful test
    await supabase
      .from('integrations')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', params.integrationId)
      .eq('project_id', params.projectId);
    return NextResponse.json({ success: true, message: 'Connection successful', projects });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: `Network error: ${e.message}` }, { status: 500 });
  }
}
