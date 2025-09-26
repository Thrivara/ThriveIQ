import { getSupabaseServiceRoleClient } from '@/../lib/supabase/service';

export async function provisionUser({
  userId,
  email,
}: {
  userId: string;
  email?: string | null;
}) {
  const defaultWorkspaceName = 'Default Workspace';

  try {
    const supabase = getSupabaseServiceRoleClient();

    const { error: upsertUserError } = await supabase
      .from('users')
      .upsert(
        {
          id: userId,
          email: email ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

    if (upsertUserError) {
      throw new Error(`Failed to upsert user: ${upsertUserError.message}`);
    }

    const { data: existingWorkspace, error: workspaceSelectError } = await supabase
      .from('workspaces')
      .select('id, owner_id')
      .eq('name', defaultWorkspaceName)
      .maybeSingle();

    if (workspaceSelectError) {
      throw new Error(`Failed to fetch default workspace: ${workspaceSelectError.message}`);
    }

    let workspaceId = existingWorkspace?.id as string | undefined;
    let membershipRole: 'owner' | 'contributor' = 'contributor';

    if (!workspaceId) {
      const { data: createdWorkspace, error: workspaceInsertError } = await supabase
        .from('workspaces')
        .insert({
          name: defaultWorkspaceName,
          owner_id: userId,
        })
        .select('id')
        .single();

      if (workspaceInsertError || !createdWorkspace) {
        throw new Error(`Failed to create default workspace: ${workspaceInsertError?.message ?? 'unknown error'}`);
      }

      workspaceId = createdWorkspace.id;
      membershipRole = 'owner';
    } else if (existingWorkspace?.owner_id === userId) {
      membershipRole = 'owner';
    }

    const { data: existingMember, error: memberSelectError } = await supabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberSelectError) {
      throw new Error(`Failed to check workspace membership: ${memberSelectError.message}`);
    }

    if (!existingMember) {
      const { error: memberInsertError } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: workspaceId,
          user_id: userId,
          role: membershipRole,
        });

      if (memberInsertError) {
        throw new Error(`Failed to add workspace membership: ${memberInsertError.message}`);
      }
    }

    return workspaceId;
  } catch (error) {
    console.error('Failed to provision user', {
      userId,
      email,
      message: (error as Error)?.message,
      stack: (error as Error)?.stack,
    });
    throw error;
  }
}
