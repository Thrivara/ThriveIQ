import { NextResponse } from 'next/server';
import { getAuthContext, getWorkspaceRole, ensureRole } from './projects/helpers';

function serializeWorkspace(row: any, role: string) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    billingInfo: row.billing_info ?? null,
    ownerId: row.owner_id ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    role,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: { workspaceId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, 'any');

    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .maybeSingle();

    if (error) {
      console.error('[workspace detail] fetch error', error);
      return NextResponse.json({ message: 'Failed to load workspace' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ message: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json({ workspace: serializeWorkspace(data, role!) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[workspace detail] error', error);
    return NextResponse.json({ message: 'Failed to load workspace' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { workspaceId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId } = params;
    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, ['owner']);

    const payload = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof payload.name === 'string') {
      const trimmed = payload.name.trim();
      if (!trimmed) {
        return NextResponse.json({ message: 'Workspace name is required' }, { status: 400 });
      }
      updates.name = trimmed;
    }
    if (payload.description !== undefined) {
      updates.description = payload.description === null ? null : String(payload.description);
    }
    if (payload.billingInfo !== undefined) {
      updates.billing_info = payload.billingInfo;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: 'No updates provided' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', workspaceId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[workspace detail] update error', error);
      return NextResponse.json({ message: 'Failed to update workspace' }, { status: 500 });
    }

    return NextResponse.json({ workspace: serializeWorkspace(data, role!) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[workspace detail] error', error);
    return NextResponse.json({ message: 'Failed to update workspace' }, { status: 500 });
  }
}
