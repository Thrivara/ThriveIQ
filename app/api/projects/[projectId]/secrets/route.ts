import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';
import { encryptString } from 'lib/crypto';

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { provider, encryptedValue } = body || {};
  if (!provider || !encryptedValue) return NextResponse.json({ message: 'provider and encryptedValue required' }, { status: 400 });

  // Upsert by (project_id, provider)
  let toStore = encryptedValue as string;
  try {
    if (process.env.APP_ENCRYPTION_KEY) {
      toStore = encryptString(typeof encryptedValue === 'string' ? encryptedValue : JSON.stringify(encryptedValue));
    }
  } catch (e: any) {
    return NextResponse.json({ message: `Encryption failed: ${e.message}` }, { status: 500 });
  }

  // Manual upsert to avoid requiring a DB unique constraint immediately
  const { data: existing, error: selErr } = await supabase
    .from('secrets')
    .select('id')
    .eq('project_id', params.projectId)
    .eq('provider', provider)
    .maybeSingle();

  if (selErr && selErr.code !== 'PGRST116') {
    // PGRST116 -> Results contain 0 rows; safe to ignore
    return NextResponse.json({ message: selErr.message }, { status: 500 });
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('secrets')
      .update({ encrypted_value: toStore })
      .eq('id', existing.id)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json({ message: 'Secret update failed' }, { status: 500 });
    }
    return NextResponse.json({ id: data.id, projectId: data.project_id, provider: data.provider });
  } else {
    const { data, error } = await supabase
      .from('secrets')
      .insert({ project_id: params.projectId, provider, encrypted_value: toStore })
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json({ message: 'Secret insert failed' }, { status: 500 });
    }
    return NextResponse.json({ id: data.id, projectId: data.project_id, provider: data.provider });
  }
}
