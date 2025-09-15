import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import { getVectorFileStatus } from '@/../lib/openai/vectorStore';

export async function GET(_req: Request, { params }: { params: { projectId: string; contextId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { data: ctx } = await supabase
    .from('contexts')
    .select('*')
    .eq('id', params.contextId)
    .eq('project_id', params.projectId)
    .maybeSingle();
  if (!ctx) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.projectId)
    .maybeSingle();
  if (!project?.openai_vector_store_id || !ctx.openai_file_id) {
    return NextResponse.json({ status: ctx.status || 'unknown' });
  }

  try {
    const vf = await getVectorFileStatus(project.openai_vector_store_id, ctx.openai_file_id);
    const rawStatus = (vf?.status ?? 'in_progress') as string;
    const failureStatuses = new Set(['failed', 'cancelled', 'expired']);
    const mapped = rawStatus === 'completed' ? 'ready' : failureStatuses.has(rawStatus) ? 'failed' : 'indexing';
    const chunkCount =
      (vf as any)?.chunking_strategy?.text?.chunk_count ??
      (vf as any)?.chunking_strategy?.chunk_count ??
      null;
    const lastError = (vf as any)?.last_error?.message ?? null;
    await supabase
      .from('contexts')
      .update({ status: mapped, chunk_count: chunkCount, last_error: lastError })
      .eq('id', params.contextId);
    return NextResponse.json({ status: mapped, chunkCount, lastError });
  } catch (e: any) {
    await supabase.from('contexts').update({ status: 'failed', last_error: e.message }).eq('id', params.contextId);
    return NextResponse.json({ status: 'failed', error: e.message });
  }
}

