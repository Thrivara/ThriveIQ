-- Project members: assign workspace users to projects
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Ensure FK name matches what API selects for count joins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_members_project_id_projects_id_fk'
  ) THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_project_id_projects_id_fk
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);

-- Enable RLS and basic policies aligned with workspace membership
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_members_select ON public.project_members;
DROP POLICY IF EXISTS project_members_modify ON public.project_members;

-- Allow any workspace member to read project team
CREATE POLICY project_members_select ON public.project_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = project_members.project_id
        AND wm.user_id = auth.uid()
    )
  );

-- Allow owners/admins/contributors to modify team
CREATE POLICY project_members_modify ON public.project_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = project_members.project_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner','admin','contributor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = project_members.project_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner','admin','contributor')
    )
  );
