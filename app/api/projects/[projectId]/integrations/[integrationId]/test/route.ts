import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/../lib/supabase/server';

export async function POST(_req: Request, { params }: { params: { projectId: string; integrationId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // For now, stub a success test. Replace with real API calls to Azure DevOps/Jira.
  return NextResponse.json({ success: true, message: 'Connection successful', projects: [] });
}

