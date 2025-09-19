import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/../lib/supabase/server';
import {
  TemplateAccessError,
  TemplateVersionRow,
  assertRole,
  insertTemplateAudit,
  mapTemplateRecord,
  mapVersionRecord,
  resolveProjectAccess,
  templateDraftSchema,
  validatePlaceholders,
} from './_shared';

const listQuerySchema = z.object({
  view: z.enum(['all', 'draft', 'published', 'archived']).default('all'),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

function handleError(error: unknown) {
  if (error instanceof TemplateAccessError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  console.error('[templates] Unexpected error', error);
  return NextResponse.json({ message: 'Unexpected error' }, { status: 500 });
}

export async function GET(req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const queryParams = listQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    assertRole(access.role, 'viewer');

    let base = supabase
      .from('templates')
      .select(
        `*, latest_version:template_versions!templates_latest_version_fk(*), versions:template_versions!template_versions_template_id_fkey(status, id, version, created_at, published_at, body, variables_json, example_payload_json)`,
        { count: 'exact' },
      )
      .eq('project_id', params.projectId)
      .order('updated_at', { ascending: false })
      .range(queryParams.offset, queryParams.offset + queryParams.limit - 1);

    if (queryParams.q) {
      base = base.ilike('name', `%${queryParams.q}%`);
    }

    if (queryParams.view === 'archived') {
      base = base.eq('status', 'archived');
    } else {
      base = base.eq('status', 'active');
      if (queryParams.view === 'draft') {
        base = base.eq('latest_version.status', 'draft');
      }
      if (queryParams.view === 'published') {
        base = base.eq('latest_version.status', 'published');
      }
    }

    const { data, error, count } = await base;
    if (error) throw new TemplateAccessError(error.message, 500);

    const templates = (data ?? []).map(row => {
      const template = mapTemplateRecord(row);
      const expandedRow = row as Record<string, unknown> & {
        latest_version?: TemplateVersionRow | TemplateVersionRow[] | null;
        versions?: TemplateVersionRow[];
      };
      const latestRaw = Array.isArray(expandedRow.latest_version)
        ? expandedRow.latest_version[0]
        : expandedRow.latest_version;
      const latestVersion = mapVersionRecord(latestRaw as unknown as Record<string, unknown>);
      const versionsRaw = Array.isArray(expandedRow.versions) ? expandedRow.versions : [];
      const versions = versionsRaw.map(version => mapVersionRecord(version as unknown as Record<string, unknown>));
      const publishedVersions = versions.filter(v => v?.status === 'published');
      return {
        ...template,
        latestVersion,
        publishedVersion: publishedVersions.sort((a, b) => (b?.version ?? 0) - (a?.version ?? 0))[0] ?? null,
        draftVersion: versions.find(v => v?.status === 'draft') ?? null,
      };
    });

    return NextResponse.json({
      items: templates,
      count: count ?? templates.length,
      offset: queryParams.offset,
      limit: queryParams.limit,
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: Request, { params }: { params: { projectId: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    assertRole(access.role, 'contributor');

    const rawBody = await req.json();
    const payload = templateDraftSchema.parse({
      name: rawBody.name,
      description: rawBody.description,
      body: rawBody.body,
      variables: rawBody.variables,
      examplePayload: rawBody.examplePayload ?? rawBody.example_payload_json ?? null,
    });

    const uniqueKeys = new Set<string>();
    for (const variable of payload.variables) {
      if (uniqueKeys.has(variable.key)) {
        throw new TemplateAccessError(`Duplicate variable key: ${variable.key}`, 400);
      }
      uniqueKeys.add(variable.key);
    }

    const placeholderValidation = validatePlaceholders(payload.body, payload.variables);
    if (placeholderValidation.undefinedPlaceholders.length > 0) {
      throw new TemplateAccessError(
        `Body references undefined variables: ${placeholderValidation.undefinedPlaceholders.join(', ')}`,
        400,
      );
    }

    const { data: template, error: templateError } = await supabase
      .from('templates')
      .insert({
        project_id: params.projectId,
        name: payload.name,
        description: payload.description ?? null,
        status: 'active',
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single();

    if (templateError) throw new TemplateAccessError(templateError.message, 500);

    const { data: version, error: versionError } = await supabase
      .from('template_versions')
      .insert({
        template_id: template.id,
        version: 1,
        status: 'draft',
        body: payload.body,
        variables_json: payload.variables,
        example_payload_json: payload.examplePayload,
        created_by: user.id,
      })
      .select()
      .single();

    if (versionError) throw new TemplateAccessError(versionError.message, 500);

    const updateResult = await supabase
      .from('templates')
      .update({ latest_version_id: version.id, updated_by: user.id })
      .eq('id', template.id);

    if (updateResult.error) throw new TemplateAccessError(updateResult.error.message, 500);

    await insertTemplateAudit(supabase, {
      projectId: params.projectId,
      templateId: template.id,
      actorUserId: user.id,
      action: 'create_template',
      details: {
        name: payload.name,
        description: payload.description ?? null,
      },
    });

    await insertTemplateAudit(supabase, {
      projectId: params.projectId,
      templateId: template.id,
      templateVersionId: version.id,
      actorUserId: user.id,
      action: 'create_version',
      details: {
        version: 1,
        variables: payload.variables,
        validation: placeholderValidation,
      },
    });

    return NextResponse.json(
      {
        template: mapTemplateRecord(template),
        version: mapVersionRecord(version),
        validation: placeholderValidation,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
