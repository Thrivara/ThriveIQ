import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import { getOpenAI } from '@/../lib/openai/vectorStore';

export async function DELETE(_req: Request, { params }: { params: { projectId: string; contextId: string } }) {
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

  try {
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', params.projectId)
      .maybeSingle();
    const openai = getOpenAI();
    if (project?.openai_vector_store_id && ctx.openai_file_id) {
      try { await openai.vectorStores.files.del(project.openai_vector_store_id, ctx.openai_file_id); } catch {}
      try { await openai.files.del(ctx.openai_file_id); } catch {}
    }
    await supabase.from('contexts').update({ status: 'deleted' }).eq('id', params.contextId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}

