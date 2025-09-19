import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ensureRole,
  fetchProjectAudit,
  fetchProjectDetail,
  getAuthContext,
  getProjectDependencies,
  getWorkspaceRole,
  hasDependencies,
  recordProjectAudit,
} from '../helpers';

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['active', 'planning', 'review', 'archived']).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: { workspaceId: string; projectId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId, projectId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, 'any');

    const detail = await fetchProjectDetail(supabase, workspaceId, projectId);
    if (!detail) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    const audit = await fetchProjectAudit(supabase, workspaceId, projectId, 10);

    return NextResponse.json({ project: detail, audit });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[projects] detail GET error', error);
    return NextResponse.json({ message: 'Failed to load project' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { workspaceId: string; projectId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId, projectId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, ['owner', 'admin', 'contributor']);

    const current = await fetchProjectDetail(supabase, workspaceId, projectId);
    if (!current) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    const payload = await request.json().catch(() => ({}));
    const body = updateSchema.parse(payload);

    if (!body.name && !body.description && !body.status) {
      return NextResponse.json({ message: 'No updates provided' }, { status: 400 });
    }

    if (body.status === 'archived' || current.status === 'archived') {
      ensureRole(role, ['owner', 'admin']);
    }

    const updates: Record<string, unknown> = { last_updated: new Date().toISOString() };

    if (body.name) {
      const trimmed = body.name.trim();
      if (trimmed !== current.name) {
        const { data: existing, error: existingError } = await supabase
          .from('projects')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('name', trimmed)
          .neq('id', projectId)
          .neq('status', 'archived')
          .maybeSingle();

        if (existingError) {
          console.error('[projects] update uniqueness error', existingError);
          return NextResponse.json({ message: 'Failed to validate project name' }, { status: 500 });
        }

        if (existing) {
          return NextResponse.json(
            { message: 'Another active project already uses this name' },
            { status: 409 },
          );
        }
      }
      updates.name = trimmed;
    }

    if (body.description !== undefined) {
      updates.description = body.description ?? null;
    }

    if (body.status) {
      updates.status = body.status;
    }

    const { error: updateError } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .eq('workspace_id', workspaceId);

    if (updateError) {
      console.error('[projects] update error', updateError);
      return NextResponse.json({ message: 'Failed to update project' }, { status: 500 });
    }

    const detail = await fetchProjectDetail(supabase, workspaceId, projectId);
    if (!detail) {
      return NextResponse.json({ message: 'Failed to load project' }, { status: 500 });
    }

    const changed: Record<string, unknown> = {};
    if (body.name && body.name !== current.name) changed.name = body.name.trim();
    if (body.description !== undefined && body.description !== current.description) {
      changed.description = body.description ?? null;
    }
    if (body.status && body.status !== current.status) changed.status = body.status;

    await recordProjectAudit(supabase, {
      workspaceId,
      projectId,
      actorUserId: userId,
      action: 'update',
      details: Object.keys(changed).length ? changed : { touched: true },
    });

    return NextResponse.json({ project: detail });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[projects] update error', error);
    return NextResponse.json({ message: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { workspaceId: string; projectId: string } },
) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId, projectId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, ['owner', 'admin']);

    const detail = await fetchProjectDetail(supabase, workspaceId, projectId);
    if (!detail) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }

    const dependencies = await getProjectDependencies(supabase, projectId);
    if (hasDependencies(dependencies)) {
      return NextResponse.json(
        {
          message: 'Project has dependent records and cannot be deleted',
          dependencies,
        },
        { status: 409 },
      );
    }

    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('workspace_id', workspaceId);

    if (deleteError) {
      console.error('[projects] delete error', deleteError);
      return NextResponse.json({ message: 'Failed to delete project' }, { status: 500 });
    }

    await recordProjectAudit(supabase, {
      workspaceId,
      projectId: null,
      actorUserId: userId,
      action: 'delete',
      details: {
        id: detail.id,
        name: detail.name,
        status: detail.status,
      },
    });

    return NextResponse.json({ message: 'Project deleted' });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[projects] delete error', error);
    return NextResponse.json({ message: 'Failed to delete project' }, { status: 500 });
  }
}
