import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';

export async function GET(_req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('contexts')
    .select('*')
    .eq('project_id', params.projectId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  // Map snake_case to expected camelCase names for the client
  const mapped = (data ?? [])
    .filter((r: any) => r.status !== 'deleted')
    .map((r: any) => ({
      id: r.id,
      fileName: r.file_name,
      fileSize: r.file_size,
      mimeType: r.mime_type,
      metadata: r.metadata ?? {},
    provider: r.provider,
    status: r.status,
    openaiFileId: r.openai_file_id,
    chunkCount: r.chunk_count,
    lastError: r.last_error,
    createdAt: r.created_at,
  }));

  return NextResponse.json(mapped);
}
