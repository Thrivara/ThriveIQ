import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { provider, encryptedValue } = body || {};
  if (!provider || !encryptedValue) return NextResponse.json({ message: 'provider and encryptedValue required' }, { status: 400 });

  // Upsert by (project_id, provider)
  const { data, error } = await supabase
    .from('secrets')
    .upsert({ project_id: params.projectId, provider, encrypted_value: encryptedValue }, { onConflict: 'project_id,provider' })
    .select()
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id, projectId: data.project_id, provider: data.provider });
}

