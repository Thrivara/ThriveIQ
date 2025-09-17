import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import {
  TemplateAccessError,
  TemplateVersionRow,
  assertRole,
  insertTemplateAudit,
  mapTemplateRecord,
  mapVersionRecord,
  resolveProjectAccess,
  templateContainerUpdateSchema,
} from '../_shared';

function handleError(error: unknown) {
  if (error instanceof TemplateAccessError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  console.error('[template detail] unexpected error', error);
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
      .from('templates')
      .select('*, versions:template_versions(*)')
      .eq('project_id', params.projectId)
      .eq('id', params.templateId)
      .maybeSingle();

    if (error) throw new TemplateAccessError(error.message, 500);
    if (!data) throw new TemplateAccessError('Template not found', 404);

    const typedData = data as Record<string, unknown> & { versions?: TemplateVersionRow[] };
    const versionsRaw = Array.isArray(typedData.versions) ? typedData.versions : [];
    const versions = versionsRaw
      .map(version => mapVersionRecord(version as unknown as Record<string, unknown>))
      .filter(Boolean)
      .sort((a, b) => (b?.version ?? 0) - (a?.version ?? 0));

    return NextResponse.json({
      template: mapTemplateRecord(data),
      versions,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: Request, { params }: { params: { projectId: string; templateId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    const body = await req.json();
    const payload = templateContainerUpdateSchema.parse(body);

    const requiresAdmin = payload.status !== undefined;
    assertRole(access.role, requiresAdmin ? 'admin' : 'contributor');

    const updates: Record<string, unknown> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.status !== undefined) updates.status = payload.status;
    updates.updated_by = user.id;

    const { data, error } = await supabase
      .from('templates')
      .update(updates)
      .eq('project_id', params.projectId)
      .eq('id', params.templateId)
      .select()
      .maybeSingle();

    if (error) throw new TemplateAccessError(error.message, 500);
    if (!data) throw new TemplateAccessError('Template not found', 404);

    await insertTemplateAudit(supabase, {
      projectId: params.projectId,
      templateId: params.templateId,
      actorUserId: user.id,
      action: 'update_template',
      details: updates,
    });

    return NextResponse.json({ template: mapTemplateRecord(data) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: { projectId: string; templateId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    assertRole(access.role, 'admin');

    const { data: versions, error: versionsError } = await supabase
      .from('template_versions')
      .select('id, status')
      .eq('template_id', params.templateId);

    if (versionsError) throw new TemplateAccessError(versionsError.message, 500);

    const versionRows = (versions ?? []) as Array<{ status: string }>;
    const hasPublished = versionRows.some(v => v.status === 'published');

    if (!hasPublished) {
      const { error: deleteError } = await supabase
        .from('templates')
        .delete()
        .eq('project_id', params.projectId)
        .eq('id', params.templateId);
      if (deleteError) throw new TemplateAccessError(deleteError.message, 500);
      await insertTemplateAudit(supabase, {
        projectId: params.projectId,
        templateId: params.templateId,
        actorUserId: user.id,
        action: 'delete_draft',
      });
      return NextResponse.json({ status: 'deleted' });
    }

    const { error: archiveError } = await supabase
      .from('templates')
      .update({ status: 'archived', updated_by: user.id })
      .eq('project_id', params.projectId)
      .eq('id', params.templateId);

    if (archiveError) throw new TemplateAccessError(archiveError.message, 500);

    await insertTemplateAudit(supabase, {
      projectId: params.projectId,
      templateId: params.templateId,
      actorUserId: user.id,
      action: 'archive_template',
    });

    return NextResponse.json({ status: 'archived' });
  } catch (error) {
    return handleError(error);
  }
}
