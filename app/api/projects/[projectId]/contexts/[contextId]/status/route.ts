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
  // Basic validation: ensure we have both IDs and they look like the expected OpenAI IDs.
  // Sometimes the values can be accidentally swapped in the DB (file id in project, vs id in ctx).
  let vectorStoreId = project?.openai_vector_store_id ?? null;
  let fileId = ctx.openai_file_id ?? null;

  const looksLikeFileId = (v: any) => typeof v === 'string' && v.startsWith('file-');
  const looksLikeVectorStoreId = (v: any) => typeof v === 'string' && v.startsWith('vs_');

  // If they look swapped, swap and persist corrected values.
  if (looksLikeFileId(vectorStoreId) && looksLikeVectorStoreId(fileId)) {
    const correctedVectorStoreId = fileId as string;
    const correctedFileId = vectorStoreId as string;
    // Persist swap
    await supabase.from('projects').update({ openai_vector_store_id: correctedVectorStoreId }).eq('id', params.projectId);
    await supabase.from('contexts').update({ openai_file_id: correctedFileId }).eq('id', params.contextId);
    vectorStoreId = correctedVectorStoreId;
    fileId = correctedFileId;
  }

  if (!looksLikeVectorStoreId(vectorStoreId) || !looksLikeFileId(fileId)) {
    // If either id is missing or malformed, avoid calling OpenAI and return current/unknown status.
    return NextResponse.json({ status: ctx.status || 'unknown' });
  }

  try {
    const vf = await getVectorFileStatus(vectorStoreId as string, fileId as string);
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

