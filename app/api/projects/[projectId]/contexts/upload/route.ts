import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import { ensureVectorStore, uploadFileToVectorStore } from '@/../lib/openai/vectorStore';

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ message: 'file is required' }, { status: 400 });

  // Fetch project to get vector store id
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ message: 'Project not found' }, { status: 404 });

  // Create DB row first (status uploading)
  const { data: ctxRow, error: ctxErr } = await supabase
    .from('contexts')
    .insert({
      project_id: params.projectId,
      source_type: 'upload',
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      provider: 'openai',
      status: 'uploading',
      metadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      }
    })
    .select()
    .single();
  if (ctxErr) return NextResponse.json({ message: ctxErr.message }, { status: 500 });

  try {
    // Ensure vector store
    const vectorStoreId = await ensureVectorStore(params.projectId, project, async (vectorStoreId) => {
      await supabase
        .from('projects')
        .update({ openai_vector_store_id: vectorStoreId })
        .eq('id', params.projectId);
    });
    // Upload and attach to vector store
    const openaiFileId = await uploadFileToVectorStore(file, vectorStoreId);
    await supabase
      .from('contexts')
      .update({ openai_file_id: openaiFileId, status: 'indexing' })
      .eq('id', ctxRow.id);
    return NextResponse.json({ id: ctxRow.id, status: 'indexing' });
  } catch (e: any) {
    await supabase.from('contexts').update({ status: 'failed', last_error: e.message }).eq('id', ctxRow.id);
    return NextResponse.json({ message: `Upload failed: ${e.message}` }, { status: 500 });
  }
}
