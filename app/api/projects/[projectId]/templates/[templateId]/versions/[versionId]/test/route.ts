import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from 'lib/supabase/server';
import {
  TemplateAccessError,
  assertRole,
  insertTemplateAudit,
  mapVersionRecord,
  resolveProjectAccess,
  validatePlaceholders,
  variableDescriptorSchema,
} from '../../../../_shared';

const testSchema = z.object({
  variables: z.record(z.any()).optional(),
  sampleWorkItemId: z.string().optional(),
});

function handleError(error: unknown) {
  if (error instanceof TemplateAccessError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  console.error('[template test] unexpected error', error);
  return NextResponse.json({ message: 'Unexpected error' }, { status: 500 });
}

async function fetchVersion(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  templateId: string,
  versionId: string,
) {
  const { data, error } = await supabase
    .from('template_versions')
    .select('*')
    .eq('template_id', templateId)
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw new TemplateAccessError(error.message, 500);
  if (!data) throw new TemplateAccessError('Template version not found', 404);
  return data;
}

function normalizeVariables(raw: unknown) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map(item => variableDescriptorSchema.parse(item));
}

function interpolate(body: string, values: Record<string, unknown>) {
  return body.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, key) => {
    const value = values[key];
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

export async function POST(
  req: Request,
  { params }: { params: { projectId: string; templateId: string; versionId: string } },
) {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const access = await resolveProjectAccess(supabase, params.projectId, user.id);
    assertRole(access.role, 'contributor');

    const version = await fetchVersion(supabase, params.templateId, params.versionId);
    const body = await req.json();
    const payload = testSchema.parse(body);

    const descriptors = normalizeVariables(version.variables_json);
    const validation = validatePlaceholders(version.body, descriptors);

    const examplePayload = (version.example_payload_json as Record<string, unknown> | null) ?? {};
    const defaultVariables = (examplePayload?.variables as Record<string, unknown> | undefined) ?? {};
    const resolvedVariables = { ...defaultVariables, ...(payload.variables ?? {}) };

    const preview = interpolate(version.body, resolvedVariables);
    const tokensInput = Math.ceil(version.body.length / 4);
    const tokensOutput = Math.ceil(preview.length / 4);
    const requestId = `tmpl-test-${Date.now()}`;

    await insertTemplateAudit(supabase, {
      projectId: params.projectId,
      templateId: params.templateId,
      templateVersionId: params.versionId,
      actorUserId: user.id,
      action: 'test_run',
      details: {
        variables: resolvedVariables,
        sampleWorkItemId: payload.sampleWorkItemId ?? null,
        requestId,
        tokens: {
          input: tokensInput,
          output: tokensOutput,
          total: tokensInput + tokensOutput,
        },
      },
    });

    return NextResponse.json({
      version: mapVersionRecord(version),
      parsed: {
        rendered: preview,
        variables: resolvedVariables,
      },
      output_text: preview,
      tokens: {
        input: tokensInput,
        output: tokensOutput,
        total: tokensInput + tokensOutput,
      },
      request_id: requestId,
      validation,
    });
  } catch (error) {
    return handleError(error);
  }
}
