ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS description text;
