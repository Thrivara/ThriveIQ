import { NextResponse } from 'next/server';
import {
  ensureRole,
  fetchProjectDetail,
  getAuthContext,
  getWorkspaceRole,
  recordProjectAudit,
} from '../../helpers';

export async function POST(
  _request: Request,
  { params }: { params: { workspaceId: string; projectId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId, projectId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, ['owner', 'admin']);

    const detail = await fetchProjectDetail(supabase, workspaceId, projectId);
    if (!detail) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    if (detail.status === 'archived') {
      return NextResponse.json({ project: detail });
    }

    const { error: updateError } = await supabase
      .from('projects')
      .update({
        status: 'archived',
        last_updated: new Date().toISOString(),
      })
      .eq('id', projectId)
      .eq('workspace_id', workspaceId);

    if (updateError) {
      console.error('[projects] archive error', updateError);
      return NextResponse.json({ message: 'Failed to archive project' }, { status: 500 });
    }

    const updated = await fetchProjectDetail(supabase, workspaceId, projectId);
    if (!updated) {
      return NextResponse.json({ message: 'Failed to load project' }, { status: 500 });
    }

    await recordProjectAudit(supabase, {
      workspaceId,
      projectId,
      actorUserId: userId,
      action: 'archive',
      details: { previousStatus: detail.status },
    });

    return NextResponse.json({ project: updated });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[projects] archive error', error);
    return NextResponse.json({ message: 'Failed to archive project' }, { status: 500 });
  }
}
