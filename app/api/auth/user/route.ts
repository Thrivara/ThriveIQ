import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ id: data.user.id, email: data.user.email });
}
