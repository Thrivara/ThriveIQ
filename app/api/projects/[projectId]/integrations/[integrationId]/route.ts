import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from 'lib/supabase/server';
import { enforceSingleActiveTracker, isTrackerIntegration } from 'lib/integrations';

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

export async function PATCH(req: Request, { params }: { params: { projectId: string; integrationId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const updates: any = {};
  if (typeof body.isActive === 'boolean') updates.is_active = body.isActive;
  if (body.metadata) updates.metadata = body.metadata;

  const { data, error } = await supabase
    .from('integrations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', params.integrationId)
    .eq('project_id', params.projectId)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json({ message: 'Integration update failed' }, { status: 404 });
  }
  if (data.is_active && isTrackerIntegration(data.type)) {
    await enforceSingleActiveTracker(supabase, params.projectId, data.id);
  }
  return NextResponse.json(mapIntegration(data));
}

export async function DELETE(_req: Request, { params }: { params: { projectId: string; integrationId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('id', params.integrationId)
    .eq('project_id', params.projectId);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
