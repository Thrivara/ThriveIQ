import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ message: 'file is required' }, { status: 400 });

  // For now, store only metadata in DB. You can integrate Supabase Storage later.
  const metadata = {
    originalName: file.name,
    uploadedAt: new Date().toISOString(),
    hasTextContent: /pdf|text|markdown|json|csv|word|document/.test(file.type),
  };

  const { data, error } = await supabase
    .from('contexts')
    .insert({
      project_id: params.projectId,
      source_type: 'upload',
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: null,
      metadata,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}

