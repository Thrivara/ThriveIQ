import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  fetchWorkspaceProjects,
  filterProjects,
  getAuthContext,
  getWorkspaceRole,
  ensureRole,
  recordProjectAudit,
  fetchProjectDetail,
} from './helpers';

const querySchema = z.object({
  q: z.string().optional(),
  status: z.enum(['all', 'active', 'planning', 'review', 'archived']).optional(),
  tracker: z.enum(['all', 'jira', 'azure_devops', 'none']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  updatedAfter: z.string().optional(),
  owner: z.string().uuid().optional(),
  hasIntegrations: z.enum(['true', 'false']).optional(),
});

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['active', 'planning', 'review', 'archived']).optional(),
  teamUserIds: z.array(z.string().uuid()).optional(),
});

export async function GET(request: Request, { params }: { params: { workspaceId: string } }) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, 'any');

    const url = new URL(request.url);
    const parsedQuery = querySchema.parse({
      q: url.searchParams.get('q') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      tracker: url.searchParams.get('tracker') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      updatedAfter: url.searchParams.get('updatedAfter') ?? undefined,
      owner: url.searchParams.get('owner') ?? undefined,
      hasIntegrations: url.searchParams.get('hasIntegrations') ?? undefined,
    });

    const updatedAfter = parsedQuery.updatedAfter
      ? new Date(parsedQuery.updatedAfter)
      : undefined;
    if (parsedQuery.updatedAfter && Number.isNaN(updatedAfter?.getTime())) {
      return NextResponse.json({ message: 'Invalid updatedAfter date' }, { status: 400 });
    }

    const hasIntegrations =
      parsedQuery.hasIntegrations === undefined
        ? null
        : parsedQuery.hasIntegrations === 'true';

    const rawProjects = await fetchWorkspaceProjects(supabase, workspaceId);
    const response = filterProjects(
      rawProjects,
      {
        q: parsedQuery.q,
        status: parsedQuery.status,
        tracker: parsedQuery.tracker,
        updatedAfter,
        ownerId: parsedQuery.owner,
        hasIntegrations,
      },
      parsedQuery.page,
      parsedQuery.limit,
    );

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[projects] GET error', error);
    return NextResponse.json({ message: 'Failed to load projects' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { workspaceId: string } }) {
  try {
    const { supabase, userId } = await getAuthContext();
    const { workspaceId } = params;

    const role = await getWorkspaceRole(supabase, workspaceId, userId);
    ensureRole(role, ['owner', 'admin', 'contributor']);

    const payload = await request.json().catch(() => ({}));
    const body = createProjectSchema.parse(payload);

    const normalizedStatus = body.status ?? 'active';
    const name = body.name.trim();

    const { data: existing, error: existingError } = await supabase
      .from('projects')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('name', name)
      .neq('status', 'archived')
      .maybeSingle();

    if (existingError) {
      console.error('[projects] uniqueness check error', existingError);
      return NextResponse.json({ message: 'Failed to validate project name' }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json(
        { message: 'A project with this name already exists in the workspace' },
        { status: 409 },
      );
    }

    const insertResult = await supabase
      .from('projects')
      .insert({
        workspace_id: workspaceId,
        name,
        description: body.description ?? null,
        status: normalizedStatus,
        owner_user_id: userId,
        last_updated: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertResult.error || !insertResult.data) {
      console.error('[projects] create error', insertResult.error);
      return NextResponse.json({ message: 'Failed to create project' }, { status: 500 });
    }

    // Optionally set initial team
    const teamIds = (body.teamUserIds ?? []).filter(Boolean);
    if (teamIds.length) {
      const { error: teamErr } = await supabase
        .from('project_members')
        .insert(teamIds.map((uid) => ({ project_id: insertResult.data.id, user_id: uid })));
      if (teamErr) {
        console.error('[projects] set team on create error', teamErr);
      }
    }

    const detail = await fetchProjectDetail(supabase, workspaceId, insertResult.data.id);
    if (!detail) {
      return NextResponse.json({ message: 'Failed to load project' }, { status: 500 });
    }

    await recordProjectAudit(supabase, {
      workspaceId,
      projectId: insertResult.data.id,
      actorUserId: userId,
      action: 'create',
      details: {
        name,
        status: normalizedStatus,
      },
    });

    const { integrations, ...listItem } = detail;
    return NextResponse.json(listItem, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[projects] POST error', error);
    return NextResponse.json({ message: 'Failed to create project' }, { status: 500 });
  }
}
