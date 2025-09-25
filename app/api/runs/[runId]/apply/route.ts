import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';
import { decryptString } from 'lib/crypto';

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

  // Fetch run and items
  const { data: run } = await supabase.from('runs').select('*').eq('id', params.runId).maybeSingle();
  if (!run) return NextResponse.json({ message: 'Run not found' }, { status: 404 });
  const { data: runItems } = await supabase.from('run_items').select('*').eq('run_id', params.runId);

  // ADO credentials
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('project_id', run.project_id)
    .eq('type', 'azure_devops')
    .eq('is_active', true)
    .maybeSingle();
  const { data: secret } = await supabase
    .from('secrets')
    .select('*')
    .eq('project_id', run.project_id)
    .eq('provider', 'azure_devops')
    .maybeSingle();
  if (!integration || !secret) return NextResponse.json({ message: 'ADO integration/secret missing' }, { status: 400 });
  let patRaw: string = secret.encrypted_value;
  if (process.env.APP_ENCRYPTION_KEY) patRaw = decryptString(patRaw);
  const creds = typeof patRaw === 'string' ? JSON.parse(patRaw) : patRaw;
  const organization = (integration.metadata as any)?.organization || creds.organization;
  const project = (integration.metadata as any)?.project || creds.project;
  const pat = creds.personalAccessToken;
  const authHeader = 'Basic ' + Buffer.from(':' + pat).toString('base64');

  const results: any[] = [];
  for (const item of (runItems || [])) {
    if (selectedItemIds.length && !selectedItemIds.includes(item.id)) continue;
    try {
      const after = item.after_json || {};
      const enhanced = after.enhanced || {};
      const bullets = (arr: string[]) => arr && arr.length ? `<ul>\n${arr.map((i:string)=>`<li>${i}</li>`).join('\n')}\n</ul>` : '';
      const tcsHtml = (tcs: any[]) => tcs && tcs.length ? `<ul>\n${tcs.map((tc:any)=>`<li><strong>Given</strong> ${tc.given}, <strong>When</strong> ${tc.when}, <strong>Then</strong> ${tc.then}</li>`).join('\n')}\n</ul>` : '';
      const para = (txt?: string) => (txt||'').trim() ? `<p>${String(txt).trim().replace(/\n+/g,'</p><p>')}</p>` : '';
      const ops: any[] = [];
      // Fetch current tags (and optionally story points) before writing
      const parentUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workitems/${encodeURIComponent(item.source_item_id)}?api-version=7.1`;
      const currentResp = await fetch(parentUrl, { headers: { Authorization: authHeader, Accept: 'application/json', 'X-TFS-FedAuthRedirect': 'Suppress', 'User-Agent': 'ThriveIQ/1.0' } });
      const currentJson: any = await currentResp.json().catch(()=>({}));
      const currentTags: string = currentJson?.fields?.['System.Tags'] || '';

      if (selectedFields.includes('title') && after.title) ops.push({ op: 'add', path: '/fields/System.Title', value: after.title });
      if (selectedFields.includes('description')) {
        // Rebuild description HTML if needed to include missing sections
        const rgr = enhanced.roleGoalReason ? `<p><strong>Role-Goal-Reason:</strong> ${enhanced.roleGoalReason}</p>` : '';
        const main = para(enhanced.descriptionText) || (after.descriptionHtml ?? '');
        const impl = bullets(enhanced.implementationNotes || []);
        const estimate = (typeof enhanced.storyPoints === 'number' || enhanced.estimateRationale) ? `${typeof enhanced.storyPoints==='number'?`<p><strong>Story Points:</strong> ${enhanced.storyPoints}</p>`:''}${para(enhanced.estimateRationale)}` : '';
        const gaps = bullets(enhanced.gaps || []);
        const deps = bullets(enhanced.dependencies || []);
        const combined = (after.descriptionHtml ?? (rgr + main + (impl?`<h3>Implementation Notes</h3>${impl}`:'') + (estimate?`<h3>Estimate</h3>${estimate}`:'') + (gaps?`<h3>Gaps / Ambiguities</h3>${gaps}`:'') + (deps?`<h3>Dependencies</h3>${deps}`:''))) || '';
        ops.push({ op: 'add', path: '/fields/System.Description', value: combined });
      }
      if (selectedFields.includes('acceptance')) {
        const combinedAc = (after.acceptanceCriteriaHtml && String(after.acceptanceCriteriaHtml))
          || `${bullets(enhanced.acceptanceCriteria || [])}${tcsHtml(enhanced.testCases || [])}`;
        ops.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria', value: combinedAc });
      }
      // Story points
      const sp = after.enhanced?.storyPoints;
      if (setStoryPoints && typeof sp === 'number') {
        ops.push({ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.StoryPoints', value: sp });
      }
      // Tags
      const tagsSet = new Set((currentTags || '').split(';').map((s:string)=> s.trim()).filter(Boolean));
      (enhanced.tags || ['AIEnhanced']).forEach((t:string)=> tagsSet.add(t));
      const mergedTags = Array.from(tagsSet).join('; ');
      ops.push({ op: 'add', path: '/fields/System.Tags', value: mergedTags });
      const url = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wit/workitems/${encodeURIComponent(item.source_item_id)}?api-version=7.1`;
      const resp = await fetch(url, { method: 'PATCH', headers: { Authorization: authHeader, 'Content-Type': 'application/json-patch+json', Accept: 'application/json', 'X-TFS-FedAuthRedirect': 'Suppress', 'User-Agent': 'ThriveIQ/1.0' }, body: JSON.stringify(ops) });
      if (!resp.ok) {
        const t = await resp.text();
        await supabase.from('run_items').update({ status: 'rejected' }).eq('id', item.id);
        results.push({ itemId: item.id, success: false, error: t });
        continue;
      }
      await supabase.from('run_items').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', item.id);
      // Create child tasks
      const created: any = { tasks: [], testCases: [] };
      if (createTasks && enhanced?.tasks?.length) {
        for (const t of enhanced.tasks) {
          const childOps = [
            { op: 'add', path: '/fields/System.Title', value: t },
            { op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workItems/${encodeURIComponent(item.source_item_id)}` } },
          ];
          const childUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wit/workitems/$Task?api-version=7.1`;
          const cResp = await fetch(childUrl, { method: 'POST', headers: { Authorization: authHeader, 'Content-Type': 'application/json-patch+json', Accept: 'application/json' }, body: JSON.stringify(childOps) });
          if (cResp.ok) created.tasks.push(await cResp.json());
        }
      }
      // Create test cases
      if (createTestCases && enhanced?.testCases?.length) {
        for (const tc of enhanced.testCases) {
          const title = `Test: Given ${tc.given}, When ${tc.when}, Then ${tc.then}`;
          const tcDesc = `<p><strong>Given</strong> ${tc.given}</p><p><strong>When</strong> ${tc.when}</p><p><strong>Then</strong> ${tc.then}</p>`;
          const childOps = [
            { op: 'add', path: '/fields/System.Title', value: title },
            { op: 'add', path: '/fields/System.Description', value: tcDesc },
            { op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/wit/workItems/${encodeURIComponent(item.source_item_id)}` } },
          ];
          const tcUrl = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis/wit/workitems/$Test%20Case?api-version=7.1`;
          const tResp = await fetch(tcUrl, { method: 'POST', headers: { Authorization: authHeader, 'Content-Type': 'application/json-patch+json', Accept: 'application/json' }, body: JSON.stringify(childOps) });
          if (tResp.ok) created.testCases.push(await tResp.json());
        }
      }
      results.push({ itemId: item.id, success: true });
    } catch (e: any) {
      await supabase.from('run_items').update({ status: 'rejected' }).eq('id', item.id);
      results.push({ itemId: item.id, success: false, error: e.message });
    }
  }

  return NextResponse.json({ results });
}
