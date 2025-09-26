import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, workspaces(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  const workspaces = (data ?? []).map((r: any) => ({
    ...(r.workspaces ?? {}),
    role: r.role,
  }));
  return NextResponse.json(workspaces);
}

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth?.user?.email ?? null;
  const userId = auth?.user?.id;
  if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // Ensure user row exists before creating workspace (FK constraint)
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (!existingUser) {
    await supabase.from('users').insert({ id: userId, email });
  }

  const body = await req.json();
  const { name, billingInfo } = body || {};
  if (!name) return NextResponse.json({ message: 'name is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('workspaces')
    .insert({ name, owner_id: userId, billing_info: billingInfo })
    .select()
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  await supabase.from('workspace_members').insert({ workspace_id: data.id, user_id: userId, role: 'owner' });
  return NextResponse.json(data);
}
