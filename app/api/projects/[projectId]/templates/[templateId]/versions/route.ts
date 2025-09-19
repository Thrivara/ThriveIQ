import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import {
  TemplateAccessError,
  assertRole,
  insertTemplateAudit,
  mapVersionRecord,
  resolveProjectAccess,
} from '../../_shared';

function handleError(error: unknown) {
  if (error instanceof TemplateAccessError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  console.error('[template versions] unexpected error', error);
  return NextResponse.json({ message: 'Unexpected error' }, { status: 500 });
}

export async function GET(_req: Request, { params }: { params: { projectId: string; templateId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    assertRole(access.role, 'viewer');

    const { data, error } = await supabase
      .from('template_versions')
      .select('*')
      .eq('template_id', params.templateId)
      .order('version', { ascending: false });

    if (error) throw new TemplateAccessError(error.message, 500);

    const versions = (data ?? [])
      .map(version => mapVersionRecord(version as unknown as Record<string, unknown>))
      .filter(Boolean);

    return NextResponse.json({ versions });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(_req: Request, { params }: { params: { projectId: string; templateId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    assertRole(access.role, 'contributor');

    const { data: versions, error } = await supabase
      .from('template_versions')
      .select('*')
      .eq('template_id', params.templateId)
      .order('version', { ascending: false });

    if (error) throw new TemplateAccessError(error.message, 500);

    const latest = versions?.[0];
    if (!latest) throw new TemplateAccessError('No base version available to duplicate', 400);

    const nextVersionNumber = Number(latest.version) + 1;

    const { data: newVersion, error: insertError } = await supabase
      .from('template_versions')
      .insert({
        template_id: params.templateId,
        version: nextVersionNumber,
        status: 'draft',
        body: latest.body,
        variables_json: latest.variables_json,
        example_payload_json: latest.example_payload_json,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) throw new TemplateAccessError(insertError.message, 500);

    const { error: updateError } = await supabase
      .from('templates')
      .update({ latest_version_id: newVersion.id, updated_by: user.id })
      .eq('id', params.templateId)
      .eq('project_id', params.projectId);

    if (updateError) throw new TemplateAccessError(updateError.message, 500);

    await insertTemplateAudit(supabase, {
      projectId: params.projectId,
      templateId: params.templateId,
      templateVersionId: newVersion.id,
      actorUserId: user.id,
      action: 'create_version',
      details: {
        version: nextVersionNumber,
        duplicatedFrom: latest.id,
      },
    });

    return NextResponse.json({ version: mapVersionRecord(newVersion) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
