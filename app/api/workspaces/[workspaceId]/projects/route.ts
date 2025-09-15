import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';

export async function GET(_req: Request, { params }: { params: { workspaceId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', params.workspaceId)
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

