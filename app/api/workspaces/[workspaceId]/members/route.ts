import { NextResponse } from 'next/server';
import { getAuthContext, getWorkspaceRole, ensureRole } from '../projects/helpers';
import { getSupabaseServiceRoleClient } from '@/../lib/supabase/service';

const ALLOWED_ROLES = ['owner', 'admin', 'contributor', 'viewer'] as const;
type WorkspaceRole = (typeof ALLOWED_ROLES)[number];

function normalizeRole(value: unknown): WorkspaceRole {
  if (typeof value !== 'string') return 'contributor';
  return (ALLOWED_ROLES.find((role) => role === value) ?? 'contributor') as WorkspaceRole;
}

export async function GET(
  _request: Request,
  { params }: { params: { workspaceId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, 'any');

    const { data, error } = await supabase
      .from('workspace_members')
      .select(
        `
          user_id,
          role,
          users(id, email, first_name, last_name)
        `,
      )
      .eq('workspace_id', workspaceId)
      .order('role', { ascending: true });

    if (error) {
      console.error('[workspace members] list error', error);
      return NextResponse.json({ message: 'Failed to load workspace members' }, { status: 500 });
    }

    const members = (data ?? []).map((member: any) => ({
      userId: member.user_id,
      role: member.role,
      user: member.users
        ? {
            id: member.users.id,
            email: member.users.email ?? null,
            firstName: member.users.first_name ?? null,
            lastName: member.users.last_name ?? null,
          }
        : null,
    }));

    return NextResponse.json({ members, currentRole: role });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[workspace members] error', error);
    return NextResponse.json({ message: 'Failed to load workspace members' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, ['owner']);

    const payload = await request.json();
    const email = String(payload?.email ?? '').trim().toLowerCase();
    const requestedRole = normalizeRole(payload?.role);

    if (!email) {
      return NextResponse.json({ message: 'Email is required' }, { status: 400 });
    }

    const serviceSupabase = getSupabaseServiceRoleClient();

    let targetUser = null as { id: string; email?: string | null } | null;
    let page = 1;
    const perPage = 200;

    while (!targetUser) {
      const { data: usersPage, error: fetchUserError } = await serviceSupabase.auth.admin.listUsers({
        page,
        perPage,
      });

      if (fetchUserError) {
        console.error('[workspace members] get user error', fetchUserError);
        return NextResponse.json({ message: 'Failed to look up user' }, { status: 500 });
      }

      const match = usersPage?.users?.find((userRecord: any) => {
        return userRecord?.email?.toLowerCase() === email;
      });

      if (match) {
        targetUser = match;
        break;
      }

      if (!usersPage?.users?.length || usersPage.users.length < perPage) {
        break;
      }

      page += 1;
    }

    if (!targetUser) {
      const { data: inviteData, error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
        data: { invited_by: userId, invited_workspace: workspaceId },
      });

      if (inviteError) {
        console.error('[workspace members] invite error', inviteError);
        return NextResponse.json({ message: 'Failed to invite user' }, { status: 500 });
      }

      targetUser = inviteData.user ?? null;
    }

    if (!targetUser?.id) {
      return NextResponse.json({ message: 'Unable to resolve user for invite' }, { status: 500 });
    }

    await serviceSupabase
      .from('users')
      .upsert({ id: targetUser.id, email: targetUser.email, updated_at: new Date().toISOString() });

    const existingMembership = await serviceSupabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUser.id)
      .maybeSingle();

    if (existingMembership.error) {
      console.error('[workspace members] existing membership check failed', existingMembership.error);
      return NextResponse.json({ message: 'Failed to invite member' }, { status: 500 });
    }

    if (existingMembership.data) {
      return NextResponse.json({ message: 'User is already a member of this workspace' }, { status: 409 });
    }

    const { error: membershipError } = await serviceSupabase
      .from('workspace_members')
      .insert({
        workspace_id: workspaceId,
        user_id: targetUser.id,
        role: requestedRole,
      });

    if (membershipError) {
      console.error('[workspace members] membership insert error', membershipError);
      return NextResponse.json({ message: 'Failed to add workspace member' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[workspace members] invite error', error);
    return NextResponse.json({ message: 'Failed to invite member' }, { status: 500 });
  }
}
