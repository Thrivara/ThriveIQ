-- Template management schema overhaul
CREATE TYPE template_status AS ENUM ('active', 'archived');
CREATE TYPE template_version_status AS ENUM ('draft', 'published');

ALTER TABLE templates
  ADD COLUMN latest_version_id uuid,
  ADD COLUMN status template_status DEFAULT 'active' NOT NULL,
  ADD COLUMN created_by varchar,
  ADD COLUMN updated_by varchar;

ALTER TABLE templates
  ADD CONSTRAINT templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  ADD CONSTRAINT templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);

ALTER TABLE templates
  DROP COLUMN body,
  DROP COLUMN variables,
  DROP COLUMN version,
  DROP COLUMN is_active;

CREATE TABLE template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status template_version_status NOT NULL DEFAULT 'draft',
  body text NOT NULL,
  variables_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  example_payload_json jsonb,
  published_at timestamptz,
  published_by varchar REFERENCES public.users(id),
  created_by varchar REFERENCES public.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX template_versions_template_version_idx ON template_versions(template_id, version);
CREATE INDEX template_versions_status_idx ON template_versions(template_id, status);

ALTER TABLE templates
  ADD CONSTRAINT templates_latest_version_fk FOREIGN KEY (latest_version_id) REFERENCES template_versions(id);

CREATE TABLE template_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id uuid REFERENCES templates(id) ON DELETE CASCADE,
  template_version_id uuid REFERENCES template_versions(id) ON DELETE CASCADE,
  actor_user_id varchar NOT NULL REFERENCES public.users(id),
  action text NOT NULL,
  details_json jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX template_audit_template_idx ON template_audit(template_id);
CREATE INDEX template_audit_version_idx ON template_audit(template_version_id);
CREATE INDEX template_audit_project_idx ON template_audit(project_id);

CREATE UNIQUE INDEX templates_project_id_name_active_idx
  ON templates(project_id, name)
  WHERE status = 'active';
CREATE INDEX templates_project_status_idx ON templates(project_id, status);

ALTER TABLE runs
  ADD COLUMN template_version_id uuid REFERENCES template_versions(id),
  ADD COLUMN template_version integer;
