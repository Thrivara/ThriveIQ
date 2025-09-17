import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import {
  TemplateAccessError,
  assertRole,
  draftUpdateSchema,
  insertTemplateAudit,
  mapVersionRecord,
  resolveProjectAccess,
  validatePlaceholders,
  variableDescriptorSchema,
} from '../../../_shared';

function handleError(error: unknown) {
  if (error instanceof TemplateAccessError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  console.error('[template version] unexpected error', error);
  return NextResponse.json({ message: 'Unexpected error' }, { status: 500 });
}

async function fetchVersion(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  templateId: string,
  versionId: string,
) {
  const { data, error } = await supabase
    .from('template_versions')
    .select('*')
    .eq('template_id', templateId)
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw new TemplateAccessError(error.message, 500);
  if (!data) throw new TemplateAccessError('Template version not found', 404);
  return data;
}

function normalizeVariables(raw: unknown) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map(item => variableDescriptorSchema.parse(item));
}

export async function GET(_req: Request, { params }: { params: { projectId: string; templateId: string; versionId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    assertRole(access.role, 'viewer');

    const data = await fetchVersion(supabase, params.templateId, params.versionId);
    return NextResponse.json({ version: mapVersionRecord(data) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: Request, { params }: { params: { projectId: string; templateId: string; versionId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    assertRole(access.role, 'contributor');

    const existing = await fetchVersion(supabase, params.templateId, params.versionId);
    if (existing.status === 'published') {
      throw new TemplateAccessError('Published versions cannot be edited', 400);
    }

    const body = await req.json();
    const payload = draftUpdateSchema.parse({
      body: body.body,
      variables: body.variables,
      examplePayload: body.examplePayload ?? body.example_payload_json ?? null,
    });

    const mergedBody = payload.body ?? existing.body;
    const mergedVariables = normalizeVariables(payload.variables ?? existing.variables_json);

    const placeholderValidation = validatePlaceholders(mergedBody, mergedVariables);
    if (placeholderValidation.undefinedPlaceholders.length > 0) {
      throw new TemplateAccessError(
        `Body references undefined variables: ${placeholderValidation.undefinedPlaceholders.join(', ')}`,
        400,
      );
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.body !== undefined) updates.body = payload.body;
    if (payload.variables !== undefined) updates.variables_json = payload.variables;
    if (payload.examplePayload !== undefined) updates.example_payload_json = payload.examplePayload;

    const { data, error } = await supabase
      .from('template_versions')
      .update(updates)
      .eq('id', params.versionId)
      .eq('template_id', params.templateId)
      .select()
      .maybeSingle();

    if (error) throw new TemplateAccessError(error.message, 500);
    if (!data) throw new TemplateAccessError('Template version not found', 404);

    await insertTemplateAudit(supabase, {
      projectId: params.projectId,
      templateId: params.templateId,
      templateVersionId: params.versionId,
      actorUserId: user.id,
      action: 'update_version',
      details: { updates, validation: placeholderValidation },
    });

    return NextResponse.json({ version: mapVersionRecord(data), validation: placeholderValidation });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: { projectId: string; templateId: string; versionId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    assertRole(access.role, 'contributor');

    const existing = await fetchVersion(supabase, params.templateId, params.versionId);
    if (existing.status === 'published') {
      throw new TemplateAccessError('Published versions cannot be deleted', 400);
    }

    const { error } = await supabase
      .from('template_versions')
      .delete()
      .eq('id', params.versionId)
      .eq('template_id', params.templateId);

    if (error) throw new TemplateAccessError(error.message, 500);

    await insertTemplateAudit(supabase, {
      projectId: params.projectId,
      templateId: params.templateId,
      templateVersionId: params.versionId,
      actorUserId: user.id,
      action: 'delete_draft_version',
    });

    const { data: latest } = await supabase
      .from('template_versions')
      .select('id')
      .eq('template_id', params.templateId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) {
      await supabase
        .from('templates')
        .update({ latest_version_id: latest.id, updated_by: user.id })
        .eq('id', params.templateId)
        .eq('project_id', params.projectId);
    }

    return NextResponse.json({ status: 'deleted' });
  } catch (error) {
    return handleError(error);
  }
}
