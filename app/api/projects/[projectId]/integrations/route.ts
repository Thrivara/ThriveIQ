import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';

function mapIntegration(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    credentialsRef: row.credentials_ref ?? null,
    metadata: row.metadata ?? null,
    isActive: row.is_active ?? false,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('project_id', params.projectId)
    .order('type', { ascending: true });
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  const mapped = (data ?? []).map(mapIntegration);
  return NextResponse.json(mapped);
}

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { type, credentialsRef, metadata } = body || {};
  if (!type) return NextResponse.json({ message: 'type required' }, { status: 400 });

  const { data, error } = await supabase
    .from('integrations')
    .insert({ project_id: params.projectId, type, credentials_ref: credentialsRef ?? null, metadata: metadata ?? null, is_active: true })
    .select()
    .single();
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json(mapIntegration(data));
}
