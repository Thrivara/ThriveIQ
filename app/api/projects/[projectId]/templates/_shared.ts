import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkspaceRole = 'owner' | 'admin' | 'contributor' | 'viewer';

const ROLE_PRIORITY: Record<WorkspaceRole, number> = {
  viewer: 1,
  contributor: 2,
  admin: 3,
  owner: 4,
};

export interface ProjectAccessContext {
  project: { id: string; workspace_id: string; status?: string | null };
  role: WorkspaceRole;
}

export class TemplateAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function resolveProjectAccess(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<ProjectAccessContext> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, workspace_id, status')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError) {
    throw new TemplateAccessError(projectError.message, 500);
  }
  if (!project) {
    throw new TemplateAccessError('Project not found', 404);
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', project.workspace_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError) {
    throw new TemplateAccessError(membershipError.message, 500);
  }
  if (!membership) {
    throw new TemplateAccessError('Access denied', 403);
  }

  return { project, role: membership.role as WorkspaceRole };
}

export function assertRole(role: WorkspaceRole, minimum: WorkspaceRole) {
  if (ROLE_PRIORITY[role] < ROLE_PRIORITY[minimum]) {
    throw new TemplateAccessError('Insufficient permissions', 403);
  }
}

const variableTypeSchema = z.enum(['string', 'text', 'number', 'boolean']);

export const variableDescriptorSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Variable keys must use snake_case letters, digits, and underscores'),
  label: z.string().min(1),
  type: variableTypeSchema.default('string'),
  required: z.boolean().default(false),
  hint: z.string().max(500).optional(),
});

export const variablesSchema = z
  .array(variableDescriptorSchema)
  .max(32, 'Limit variables to 32 entries')
  .optional()
  .transform(list => list ?? []);

export const examplePayloadSchema = z
  .record(z.any())
  .optional()
  .transform(value => (value === undefined ? null : value));

export const templateDraftSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  body: z.string().min(1),
  variables: variablesSchema,
  examplePayload: examplePayloadSchema,
});

export const draftUpdateSchema = z.object({
  body: z.string().min(1).optional(),
  variables: variablesSchema.optional(),
  examplePayload: examplePayloadSchema.optional(),
});

export const templateContainerUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

type VariableDescriptor = z.infer<typeof variableDescriptorSchema>;

export interface PlaceholderValidationResult {
  unusedVariables: string[];
  undefinedPlaceholders: string[];
}

export function validatePlaceholders(body: string, variables: VariableDescriptor[]): PlaceholderValidationResult {
  const placeholderRegex = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const matches = Array.from(body.matchAll(placeholderRegex));
  const placeholderKeys = new Set<string>();
  for (const match of matches) {
    placeholderKeys.add(match[1]);
  }

  const variableKeys = new Set(variables.map(v => v.key));
  const undefinedPlaceholders = Array.from(placeholderKeys).filter(key => !variableKeys.has(key));
  const unusedVariables = variables.filter(v => !placeholderKeys.has(v.key)).map(v => v.key);

  return { unusedVariables, undefinedPlaceholders };
}

export async function insertTemplateAudit(
  supabase: SupabaseClient,
  payload: {
    projectId: string;
    templateId?: string | null;
    templateVersionId?: string | null;
    actorUserId: string;
    action: string;
    details?: Record<string, unknown> | null;
  },
) {
  const { error } = await supabase.from('template_audit').insert({
    project_id: payload.projectId,
    template_id: payload.templateId ?? null,
    template_version_id: payload.templateVersionId ?? null,
    actor_user_id: payload.actorUserId,
    action: payload.action,
    details_json: payload.details ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to write template audit entry', error);
  }
}

export interface TemplateRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: string;
  latest_version_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateVersionRow {
  id: string;
  template_id: string;
  version: number;
  status: string;
  body: string;
  variables_json: unknown;
  example_payload_json: unknown;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
}

export function mapTemplateRecord(record: Record<string, unknown> | null | undefined) {
  if (!record) return null;
  const data = record as unknown as TemplateRow;
  return {
    id: data.id,
    projectId: data.project_id,
    name: data.name,
    description: data.description,
    status: data.status,
    latestVersionId: data.latest_version_id,
    createdBy: data.created_by,
    updatedBy: data.updated_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export function mapVersionRecord(record: Record<string, unknown> | null | undefined) {
  if (!record) return null;
  const data = record as unknown as TemplateVersionRow;
  return {
    id: data.id,
    templateId: data.template_id,
    version: data.version,
    status: data.status,
    body: data.body,
    variables: (data.variables_json as VariableDescriptor[]) ?? [],
    examplePayload: data.example_payload_json ?? null,
    publishedAt: data.published_at,
    publishedBy: data.published_by,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}
