import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import {
  TemplateAccessError,
  assertRole,
  insertTemplateAudit,
  mapVersionRecord,
  resolveProjectAccess,
} from '../../../../_shared';

function handleError(error: unknown) {
  if (error instanceof TemplateAccessError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  console.error('[template publish] unexpected error', error);
  return NextResponse.json({ message: 'Unexpected error' }, { status: 500 });
}

export async function POST(
  _req: Request,
  { params }: { params: { projectId: string; templateId: string; versionId: string } },
) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    assertRole(access.role, 'admin');

    const { data: version, error } = await supabase
      .from('template_versions')
      .select('*')
      .eq('id', params.versionId)
      .eq('template_id', params.templateId)
      .maybeSingle();

    if (error) throw new TemplateAccessError(error.message, 500);
    if (!version) throw new TemplateAccessError('Template version not found', 404);
    if (version.status === 'published') {
      throw new TemplateAccessError('Version already published', 400);
    }

    const { data: updatedVersion, error: publishError } = await supabase
      .from('template_versions')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: user.id,
      })
      .eq('id', params.versionId)
      .eq('template_id', params.templateId)
      .select()
      .maybeSingle();

    if (publishError) throw new TemplateAccessError(publishError.message, 500);
    if (!updatedVersion) throw new TemplateAccessError('Template version not found', 404);

    const { error: updateTemplateError } = await supabase
      .from('templates')
      .update({ latest_version_id: params.versionId, status: 'active', updated_by: user.id })
      .eq('id', params.templateId)
      .eq('project_id', params.projectId);

    if (updateTemplateError) throw new TemplateAccessError(updateTemplateError.message, 500);

    await insertTemplateAudit(supabase, {
      projectId: params.projectId,
      templateId: params.templateId,
      templateVersionId: params.versionId,
      actorUserId: user.id,
      action: 'publish_version',
      details: { version: updatedVersion.version },
    });

    return NextResponse.json({ version: mapVersionRecord(updatedVersion) });
  } catch (error) {
    return handleError(error);
  }
}
