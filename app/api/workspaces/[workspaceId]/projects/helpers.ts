import { createSupabaseServerClient } from '@/../lib/supabase/server';
import type { ProjectStatus } from '@/../shared/schema';
import { NextResponse } from 'next/server';

type WorkspaceRole = 'owner' | 'admin' | 'contributor' | 'viewer';
type TrackerType = 'jira' | 'azure_devops' | 'none';

const TRACKER_LABEL: Record<Exclude<TrackerType, 'none'> | 'none', string> = {
  jira: 'Jira',
  azure_devops: 'Azure DevOps',
  none: 'None',
};

export interface ProjectDependencies {
  integrations: number;
  templates: number;
  contexts: number;
  runs: number;
}

export interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  itemCount: number;
  memberCount: number;
  lastUpdated: string | null;
  ownerUserId: string | null;
  tracker: {
    type: TrackerType;
    label: string;
  };
  hasIntegrations: boolean;
  canArchive: boolean;
  canDelete: boolean;
  dependencies: ProjectDependencies;
}

export interface ProjectDetail extends ProjectListItem {
  integrations: Array<{
    id: string;
    type: string;
    isActive: boolean;
    createdAt: string | null;
    metadata: Record<string, unknown> | null;
  }>;
}

export interface ProjectAuditEntry {
  id: string;
  action: string;
  actorUserId: string;
  detailsJson: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface ProjectListResponse {
  items: ProjectListItem[];
  page: number;
  limit: number;
  total: number;
}

interface ProjectFilters {
  q?: string;
  status?: ProjectStatus | 'all';
  tracker?: TrackerType | 'all';
  updatedAfter?: Date;
  ownerId?: string;
  hasIntegrations?: boolean | null;
}

type SupabaseClient = ReturnType<typeof createSupabaseServerClient>;

type RawProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  item_count: number;
  member_count: number;
  last_updated: string | null;
  updated_at: string | null;
  owner_user_id: string | null;
  integrations: Array<{
    id: string;
    type: string;
    is_active: boolean;
    created_at: string | null;
    metadata?: Record<string, unknown> | null;
  }> | null;
  integration_stats?: Array<{ count: number }> | null;
  template_stats?: Array<{ count: number }> | null;
  context_stats?: Array<{ count: number }> | null;
  run_stats?: Array<{ count: number }> | null;
};

export async function getAuthContext() {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) {
    throw NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  return { supabase, userId: user.id };
}

export async function getWorkspaceRole(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[projects] getWorkspaceRole error', error);
    throw NextResponse.json({ message: 'Failed to verify workspace membership' }, { status: 500 });
  }

  return (data?.role ?? null) as WorkspaceRole | null;
}

export function ensureRole(
  role: WorkspaceRole | null,
  allowed: WorkspaceRole[] | 'any',
): asserts role is WorkspaceRole {
  if (!role) {
    throw NextResponse.json({ message: 'Access denied' }, { status: 403 });
  }

  if (allowed !== 'any' && !allowed.includes(role)) {
    throw NextResponse.json({ message: 'Insufficient permissions' }, { status: 403 });
  }
}

function getCount(aggregate: Array<{ count: number }> | null | undefined) {
  return aggregate?.[0]?.count ?? 0;
}

function toProjectItem(row: RawProjectRow): ProjectListItem {
  const integrations = row.integrations ?? [];
  const activeIntegrations = integrations
    .filter((integration) => integration?.is_active)
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });

  const trackerIntegration = activeIntegrations[0];
  const trackerType = (trackerIntegration?.type as TrackerType | undefined) ?? 'none';
  const dependencies: ProjectDependencies = {
    integrations: getCount(row.integration_stats),
    templates: getCount(row.template_stats),
    contexts: getCount(row.context_stats),
    runs: getCount(row.run_stats),
  };
  const dependencyTotal =
    dependencies.integrations +
    dependencies.templates +
    dependencies.contexts +
    dependencies.runs;

  const lastUpdated = row.last_updated ?? row.updated_at;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    itemCount: row.item_count,
    memberCount: row.member_count,
    lastUpdated,
    ownerUserId: row.owner_user_id,
    tracker: {
      type: trackerType,
      label: TRACKER_LABEL[trackerType],
    },
    hasIntegrations: activeIntegrations.length > 0,
    canArchive: row.status !== 'archived',
    canDelete: dependencyTotal === 0,
    dependencies,
  };
}

export function filterProjects(
  projects: RawProjectRow[],
  filters: ProjectFilters,
  page: number,
  limit: number,
): ProjectListResponse {
  const normalizedSearch = filters.q?.toLowerCase().trim() ?? '';
  const filtered = projects
    .map(toProjectItem)
    .filter((project) => {
      if (filters.status && filters.status !== 'all' && project.status !== filters.status) {
        return false;
      }

      if (filters.tracker && filters.tracker !== 'all' && project.tracker.type !== filters.tracker) {
        return false;
      }

      if (filters.hasIntegrations === true && !project.hasIntegrations) {
        return false;
      }

      if (filters.hasIntegrations === false && project.hasIntegrations) {
        return false;
      }

      if (filters.ownerId && project.ownerUserId !== filters.ownerId) {
        return false;
      }

      if (filters.updatedAfter) {
        const updatedAt = project.lastUpdated ? new Date(project.lastUpdated) : null;
        if (!updatedAt || updatedAt.getTime() < filters.updatedAfter.getTime()) {
          return false;
        }
      }

      if (normalizedSearch) {
        const combined = `${project.name} ${project.description ?? ''}`.toLowerCase();
        if (!combined.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return bTime - aTime;
    });

  const total = filtered.length;
  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);

  return {
    items,
    page,
    limit,
    total,
  };
}

export async function fetchWorkspaceProjects(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<RawProjectRow[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      `
        id,
        workspace_id,
        name,
        description,
        status,
        item_count,
        member_count,
        last_updated,
        updated_at,
        owner_user_id,
        integrations:integrations(id, type, is_active, created_at, metadata),
        integration_stats:integrations!integrations_project_id_projects_id_fk(count),
        template_stats:templates!templates_project_id_projects_id_fk(count),
        context_stats:contexts!contexts_project_id_projects_id_fk(count),
        run_stats:runs!runs_project_id_projects_id_fk(count)
      `,
    )
    .eq('workspace_id', workspaceId)
    .order('last_updated', { ascending: false, nullsLast: true });

  if (error) {
    console.error('[projects] fetchWorkspaceProjects error', error);
    throw NextResponse.json({ message: 'Failed to load projects' }, { status: 500 });
  }

  return (data ?? []) as RawProjectRow[];
}

export async function fetchProjectDetail(
  supabase: SupabaseClient,
  workspaceId: string,
  projectId: string,
): Promise<ProjectDetail | null> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      `
        id,
        workspace_id,
        name,
        description,
        status,
        item_count,
        member_count,
        last_updated,
        updated_at,
        owner_user_id,
        integrations:integrations(id, type, is_active, created_at, metadata),
        integration_stats:integrations!integrations_project_id_projects_id_fk(count),
        template_stats:templates!templates_project_id_projects_id_fk(count),
        context_stats:contexts!contexts_project_id_projects_id_fk(count),
        run_stats:runs!runs_project_id_projects_id_fk(count)
      `,
    )
    .eq('workspace_id', workspaceId)
    .eq('id', projectId)
    .maybeSingle();

  if (error) {
    console.error('[projects] fetchProjectDetail error', error);
    throw NextResponse.json({ message: 'Failed to load project' }, { status: 500 });
  }

  if (!data) return null;

  const base = toProjectItem(data as RawProjectRow);

  return {
    ...base,
    integrations: (data.integrations ?? []).map((integration: any) => ({
      id: integration.id,
      type: integration.type,
      isActive: integration.is_active,
      createdAt: integration.created_at ?? null,
      metadata: integration.metadata ?? null,
    })),
  };
}

export async function fetchProjectAudit(
  supabase: SupabaseClient,
  workspaceId: string,
  projectId: string,
  limit = 10,
): Promise<ProjectAuditEntry[]> {
  const { data, error } = await supabase
    .from('project_audit')
    .select(
      `
        id,
        action,
        details_json,
        created_at,
        actor_user_id,
        actor:users(id, email, first_name, last_name)
      `,
    )
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[projects] fetchProjectAudit error', error);
    throw NextResponse.json({ message: 'Failed to load audit history' }, { status: 500 });
  }

  return (data ?? []).map((entry: any) => ({
    id: entry.id,
    action: entry.action,
    actorUserId: entry.actor_user_id,
    detailsJson: entry.details_json ?? null,
    createdAt: entry.created_at,
    actor: entry.actor
      ? {
          id: entry.actor.id,
          email: entry.actor.email ?? null,
          firstName: entry.actor.first_name ?? null,
          lastName: entry.actor.last_name ?? null,
        }
      : null,
  }));
}

export async function recordProjectAudit(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    projectId: string | null;
    actorUserId: string;
    action: string;
    details?: Record<string, unknown> | null;
  },
) {
  const { error } = await supabase.from('project_audit').insert({
    workspace_id: params.workspaceId,
    project_id: params.projectId,
    actor_user_id: params.actorUserId,
    action: params.action,
    details_json: params.details ?? null,
  });

  if (error) {
    console.error('[projects] recordProjectAudit error', error);
  }
}

export async function getProjectDependencies(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectDependencies> {
  const [integrations, templates, contexts, runs] = await Promise.all([
    supabase
      .from('integrations')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
    supabase
      .from('templates')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
    supabase
      .from('contexts')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
    supabase
      .from('runs')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
  ]);

  const readCount = (response: { count: number | null } | null | undefined) =>
    response?.count ?? 0;

  return {
    integrations: readCount(integrations),
    templates: readCount(templates),
    contexts: readCount(contexts),
    runs: readCount(runs),
  };
}

export function hasDependencies(deps: ProjectDependencies) {
  return deps.integrations + deps.templates + deps.contexts + deps.runs > 0;
}
