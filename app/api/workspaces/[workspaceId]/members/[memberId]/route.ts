import { NextResponse } from 'next/server';
import { getAuthContext, getWorkspaceRole, ensureRole } from '../../projects/helpers';
import { getSupabaseServiceRoleClient } from '@/../lib/supabase/service';

const ALLOWED_ROLES = ['owner', 'admin', 'contributor', 'viewer'] as const;

type WorkspaceRole = (typeof ALLOWED_ROLES)[number];

function normalizeRole(value: unknown): WorkspaceRole | undefined {
  if (typeof value !== 'string') return undefined;
  const match = ALLOWED_ROLES.find((role) => role === value);
  return match as WorkspaceRole | undefined;
}

async function ensureAdditionalOwner(workspaceId: string, excludeUserId?: string) {
  const serviceSupabase = getSupabaseServiceRoleClient();
  let query = serviceSupabase
    .from('workspace_members')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('role', 'owner');

  if (excludeUserId) {
    query = query.neq('user_id', excludeUserId);
  }

  const { error, count } = await query;
  if (error) {
    console.error('[workspace members] ensureAdditionalOwner query error', error);
    throw NextResponse.json({ message: 'Failed to verify owner status' }, { status: 500 });
  }

  if (!count || count <= 0) {
    throw NextResponse.json({ message: 'Workspace must retain at least one owner' }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { workspaceId: string; memberId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId, memberId } = params;
    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, ['owner']);

    const payload = await request.json();
    const nextRole = normalizeRole(payload?.role);

    if (!nextRole) {
      return NextResponse.json({ message: 'Invalid role' }, { status: 400 });
    }

    const serviceSupabase = getSupabaseServiceRoleClient();

    const { data: membership, error: membershipError } = await serviceSupabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId)
      .maybeSingle();

    if (membershipError) {
      console.error('[workspace members] fetch membership error', membershipError);
      return NextResponse.json({ message: 'Failed to update member' }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json({ message: 'Workspace member not found' }, { status: 404 });
    }

    if (membership.role === 'owner' && nextRole !== 'owner') {
      await ensureAdditionalOwner(workspaceId, memberId);
    }

    const { error: updateError } = await serviceSupabase
      .from('workspace_members')
      .update({ role: nextRole })
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId);

    if (updateError) {
      console.error('[workspace members] update membership error', updateError);
      return NextResponse.json({ message: 'Failed to update member' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[workspace members] update error', error);
    return NextResponse.json({ message: 'Failed to update member' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { workspaceId: string; memberId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId, memberId } = params;
    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, ['owner']);

    const serviceSupabase = getSupabaseServiceRoleClient();

    const { data: membership, error: membershipError } = await serviceSupabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId)
      .maybeSingle();

    if (membershipError) {
      console.error('[workspace members] fetch membership error', membershipError);
      return NextResponse.json({ message: 'Failed to remove member' }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json({ message: 'Workspace member not found' }, { status: 404 });
    }

    if (membership.role === 'owner') {
      await ensureAdditionalOwner(workspaceId, memberId);
    }

    const { error: deleteError } = await serviceSupabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId);

    if (deleteError) {
      console.error('[workspace members] delete membership error', deleteError);
      return NextResponse.json({ message: 'Failed to remove member' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[workspace members] delete error', error);
    return NextResponse.json({ message: 'Failed to remove member' }, { status: 500 });
  }
}
