import { createSupabaseServerClient } from '@/../lib/supabase/server';

export async function seedInitialData() {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error('Unauthorized');

  // 1) Ensure user row exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!existingUser) {
    await supabase.from('users').insert({
      id: user.id,
      email: user.email,
      first_name: (user.user_metadata as any)?.first_name ?? null,
      last_name: (user.user_metadata as any)?.last_name ?? null,
      profile_image_url: (user.user_metadata as any)?.avatar_url ?? null,
    });
  }

  // 2) Create or reuse a default workspace
  const defaultWorkspaceName = 'Default Workspace';
  let { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('owner_id', user.id)
    .eq('name', defaultWorkspaceName)
    .maybeSingle();

  if (!workspace) {
    const { data: created } = await supabase
      .from('workspaces')
      .insert({ name: defaultWorkspaceName, owner_id: user.id })
      .select()
      .single();
    workspace = created as any;
  }

  // 3) Ensure membership as owner
  const { data: member } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspace!.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!member) {
    await supabase.from('workspace_members').insert({
      workspace_id: workspace!.id,
      user_id: user.id,
      role: 'owner',
    });
  }

  // 4) Ensure default project with fixed UUID (matches UI constants)
  const defaultProjectId = '550e8400-e29b-41d4-a716-446655440000';
  const { data: existingProject } = await supabase
    .from('projects')
    .select('id')
    .eq('id', defaultProjectId)
    .maybeSingle();
  if (!existingProject) {
    await supabase.from('projects').insert({
      id: defaultProjectId,
      workspace_id: workspace!.id,
      name: 'ThriveIQ Project',
      description: 'Initial seeded project',
    });
  }

  return { userId: user.id, workspaceId: workspace!.id, projectId: defaultProjectId };
}

