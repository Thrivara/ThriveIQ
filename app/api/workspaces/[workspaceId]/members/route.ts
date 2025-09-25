import { NextResponse } from 'next/server';
import { getAuthContext, getWorkspaceRole, ensureRole } from '../projects/helpers';

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

    return NextResponse.json({ members });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[workspace members] error', error);
    return NextResponse.json({ message: 'Failed to load workspace members' }, { status: 500 });
  }
}
