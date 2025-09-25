import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('id', params.runId)
    .maybeSingle();
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
