ALTER TABLE "contexts" ADD COLUMN "provider" varchar DEFAULT 'openai';--> statement-breakpoint
ALTER TABLE "contexts" ADD COLUMN "openai_file_id" varchar;--> statement-breakpoint
ALTER TABLE "contexts" ADD COLUMN "status" varchar DEFAULT 'uploading';--> statement-breakpoint
ALTER TABLE "contexts" ADD COLUMN "chunk_count" integer;--> statement-breakpoint
ALTER TABLE "contexts" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "openai_vector_store_id" varchar;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_secrets_project_provider" ON "secrets" USING btree ("project_id","provider");