-- Convert user-related columns to uuid for referential integrity
-- Drop FKs that reference public.users so we can change its PK type
ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_user_id_users_id_fk;
ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_owner_id_users_id_fk;
ALTER TABLE public.runs DROP CONSTRAINT IF EXISTS runs_user_id_users_id_fk;
ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_created_by_fkey;
ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_updated_by_fkey;
ALTER TABLE public.template_versions DROP CONSTRAINT IF EXISTS template_versions_created_by_fkey;
ALTER TABLE public.template_versions DROP CONSTRAINT IF EXISTS template_versions_published_by_fkey;
ALTER TABLE public.template_audit DROP CONSTRAINT IF EXISTS template_audit_actor_user_id_fkey;

-- Convert referencing columns to uuid (safe now that FKs are dropped)
ALTER TABLE public.workspace_members ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
ALTER TABLE public.workspaces ALTER COLUMN owner_id TYPE uuid USING owner_id::uuid;
ALTER TABLE public.runs ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
ALTER TABLE public.templates ALTER COLUMN created_by TYPE uuid USING created_by::uuid;
ALTER TABLE public.templates ALTER COLUMN updated_by TYPE uuid USING updated_by::uuid;
ALTER TABLE public.template_versions ALTER COLUMN created_by TYPE uuid USING created_by::uuid;
ALTER TABLE public.template_versions ALTER COLUMN published_by TYPE uuid USING published_by::uuid;
ALTER TABLE public.template_audit ALTER COLUMN actor_user_id TYPE uuid USING actor_user_id::uuid;

-- Convert users.id last (PK)
ALTER TABLE public.users ALTER COLUMN id TYPE uuid USING id::uuid;
ALTER TABLE public.users ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Recreate FKs with new uuid types
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_owner_id_users_id_fk
  FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.runs
  ADD CONSTRAINT runs_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.templates
  ADD CONSTRAINT templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.templates
  ADD CONSTRAINT templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);
ALTER TABLE public.template_versions
  ADD CONSTRAINT template_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.template_versions
  ADD CONSTRAINT template_versions_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.users(id);
ALTER TABLE public.template_audit
  ADD CONSTRAINT template_audit_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id);

-- Extend projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status text CHECK (status IN ('active','planning','review','archived')) DEFAULT 'active';
ALTER TABLE public.projects
  ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS item_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS member_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS last_updated timestamptz DEFAULT now();
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_owner_user_id_users_id_fk'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_owner_user_id_users_id_fk
      FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure project names are unique per workspace among non-archived projects
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_workspace_name_unique
  ON public.projects (workspace_id, lower(name))
  WHERE status <> 'archived';

-- Project audit table
CREATE TABLE IF NOT EXISTS public.project_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  details_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_workspace_status
  ON public.projects (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_search
  ON public.projects USING gin (
    to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))
  );
CREATE INDEX IF NOT EXISTS idx_project_audit_workspace
  ON public.project_audit (workspace_id, created_at DESC);

-- Enable RLS and policies
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_select ON public.projects;
DROP POLICY IF EXISTS projects_insert ON public.projects;
DROP POLICY IF EXISTS projects_update ON public.projects;
DROP POLICY IF EXISTS projects_delete ON public.projects;

CREATE POLICY projects_select ON public.projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY projects_insert ON public.projects
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner','admin','contributor')
    )
  );

CREATE POLICY projects_update ON public.projects
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner','admin','contributor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner','admin','contributor')
    )
  );

CREATE POLICY projects_delete ON public.projects
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner','admin')
    )
  );

DROP POLICY IF EXISTS project_audit_select ON public.project_audit;
DROP POLICY IF EXISTS project_audit_insert ON public.project_audit;

CREATE POLICY project_audit_select ON public.project_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = project_audit.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY project_audit_insert ON public.project_audit
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = project_audit.workspace_id
        AND wm.user_id = auth.uid()
    )
  );
