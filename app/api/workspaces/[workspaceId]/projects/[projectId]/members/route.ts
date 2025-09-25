import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureRole, getAuthContext, getWorkspaceRole } from '../../helpers';

const setSchema = z.object({
  userIds: z.array(z.string().uuid()).default([]),
});

export async function GET(
  _request: Request,
  { params }: { params: { workspaceId: string; projectId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId, projectId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, 'any');

    const { data, error } = await supabase
      .from('project_members')
      .select(
        `user_id, users(id, email, first_name, last_name)`
      )
      .eq('project_id', projectId);

    if (error) {
      console.error('[project members] list error', error);
      return NextResponse.json({ message: 'Failed to load project members' }, { status: 500 });
    }

    const members = (data ?? []).map((row: any) => ({
      userId: row.user_id,
      user: row.users
        ? {
            id: row.users.id,
            email: row.users.email ?? null,
            firstName: row.users.first_name ?? null,
            lastName: row.users.last_name ?? null,
          }
        : null,
    }));

    return NextResponse.json({ members });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[project members] GET error', error);
    return NextResponse.json({ message: 'Failed to load project members' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { workspaceId: string; projectId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId, projectId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, ['owner', 'admin', 'contributor']);

    const body = setSchema.parse(await request.json().catch(() => ({})));

    // Only allow users that belong to the workspace
    const { data: wsUsers, error: wsErr } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);
    if (wsErr) {
      console.error('[project members] load workspace users error', wsErr);
      return NextResponse.json({ message: 'Failed to validate team' }, { status: 500 });
    }
    const allowed = new Set((wsUsers ?? []).map((u: any) => u.user_id));
    const desired = body.userIds.filter((id) => allowed.has(id));

    // Load current members
    const { data: currentRows, error: currErr } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId);
    if (currErr) {
      console.error('[project members] load current error', currErr);
      return NextResponse.json({ message: 'Failed to update team' }, { status: 500 });
    }

    const current = new Set((currentRows ?? []).map((r: any) => r.user_id));
    const desiredSet = new Set(desired);

    const toAdd = desired.filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !desiredSet.has(id));

    if (toRemove.length) {
      const { error: delErr } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .in('user_id', toRemove);
      if (delErr) {
        console.error('[project members] delete error', delErr);
        return NextResponse.json({ message: 'Failed to update team' }, { status: 500 });
      }
    }

    if (toAdd.length) {
      const inserts = toAdd.map((uid) => ({ project_id: projectId, user_id: uid }));
      const { error: insErr } = await supabase.from('project_members').insert(inserts);
      if (insErr) {
        console.error('[project members] insert error', insErr);
        return NextResponse.json({ message: 'Failed to update team' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, added: toAdd.length, removed: toRemove.length });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[project members] PUT error', error);
    return NextResponse.json({ message: 'Failed to update team' }, { status: 500 });
  }
}

