import type { SupabaseClient } from '@supabase/supabase-js';

export const TRACKER_INTEGRATION_TYPES = ['azure_devops', 'jira'] as const;

export type TrackerIntegrationType = (typeof TRACKER_INTEGRATION_TYPES)[number];

export function isTrackerIntegration(type: string | null | undefined): type is TrackerIntegrationType {
  return TRACKER_INTEGRATION_TYPES.includes((type ?? '') as TrackerIntegrationType);
}

export async function enforceSingleActiveTracker(
  supabase: SupabaseClient,
  projectId: string,
  keepIntegrationId: string,
) {
  await supabase
    .from('integrations')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .neq('id', keepIntegrationId)
    .in('type', TRACKER_INTEGRATION_TYPES);
}
