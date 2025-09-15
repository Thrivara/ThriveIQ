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
    const mapped = vf?.status === 'completed' ? 'ready' : (vf?.status === 'in_progress' ? 'indexing' : (vf?.status || 'indexing'));
    await supabase.from('contexts').update({ status: mapped }).eq('id', params.contextId);
    return NextResponse.json({ status: mapped });
  } catch (e: any) {
    await supabase.from('contexts').update({ status: 'failed', last_error: e.message }).eq('id', params.contextId);
    return NextResponse.json({ status: 'failed', error: e.message });
  }
}

