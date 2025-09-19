import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  uniqueIndex,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  boolean,
  integer,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Sessions table removed (Replit auth deprecated)

// Enums
export const roleEnum = pgEnum("role", ["owner", "admin", "contributor", "viewer"]);
export const integrationTypeEnum = pgEnum("integration_type", ["jira", "azure_devops", "confluence", "sharepoint"]);
export const sourceTypeEnum = pgEnum("source_type", ["upload", "confluence", "sharepoint"]);
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "completed", "failed"]);
export const itemStatusEnum = pgEnum("item_status", ["pending", "generated", "applied", "rejected"]);
export const templateStatusEnum = pgEnum("template_status", ["active", "archived"]);
export const templateVersionStatusEnum = pgEnum("template_version_status", ["draft", "published"]);

// Core tables
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  billingInfo: jsonb("billing_info"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projectStatusValues = ["active", "planning", "review", "archived"] as const;

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: text("status").notNull().default("active").$type<(typeof projectStatusValues)[number]>(),
  defaultTemplateId: uuid("default_template_id"),
  llmProviderConfig: jsonb("llm_provider_config"),
  openaiVectorStoreId: varchar("openai_vector_store_id"),
  guardrails: text("guardrails"),
  itemCount: integer("item_count").notNull().default(0),
  memberCount: integer("member_count").notNull().default(0),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  type: integrationTypeEnum("type").notNull(),
  credentialsRef: varchar("credentials_ref"),
  metadata: jsonb("metadata"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    latestVersionId: uuid("latest_version_id"),
    status: templateStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  table => ({
    idxTemplatesProjectName: uniqueIndex("templates_project_id_name_active_idx")
      .on(table.projectId, table.name)
      .where(sql`${table.status} = 'active'`),
    idxTemplatesProjectStatus: index("templates_project_status_idx").on(table.projectId, table.status),
  })
);

export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    templateId: uuid("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: templateVersionStatusEnum("status").notNull().default("draft"),
    body: text("body").notNull(),
    variablesJson: jsonb("variables_json").notNull().default(sql`'[]'::jsonb`),
    examplePayloadJson: jsonb("example_payload_json"),
    publishedAt: timestamp("published_at"),
    publishedBy: uuid("published_by").references(() => users.id),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  table => ({
    templateVersionIdx: uniqueIndex("template_versions_template_version_idx").on(table.templateId, table.version),
    templateStatusIdx: index("template_versions_status_idx").on(table.templateId, table.status),
  })
);

export const templateAudit = pgTable(
  "template_audit",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => templates.id, { onDelete: "cascade" }),
    templateVersionId: uuid("template_version_id").references(() => templateVersions.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").notNull().references(() => users.id),
    action: text("action").notNull(),
    detailsJson: jsonb("details_json"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  table => ({
    auditTemplateIdx: index("template_audit_template_idx").on(table.templateId),
    auditVersionIdx: index("template_audit_version_idx").on(table.templateVersionId),
    auditProjectIdx: index("template_audit_project_idx").on(table.projectId),
  })
);

export const contexts = pgTable("contexts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sourceType: sourceTypeEnum("source_type").notNull(),
  fileName: varchar("file_name"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  storagePath: varchar("storage_path"),
  metadata: jsonb("metadata"),
  provider: varchar("provider").default('openai'),
  openaiFileId: varchar("openai_file_id"),
  status: varchar("status").default('uploading'),
  chunkCount: integer("chunk_count"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contextChunks = pgTable("context_chunks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  contextId: uuid("context_id").notNull().references(() => contexts.id, { onDelete: "cascade" }),
  embedding: text("embedding"), // pgvector will be added later
  text: text("text").notNull(),
  chunkMeta: jsonb("chunk_meta"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => templates.id),
  templateVersionId: uuid("template_version_id").references(() => templateVersions.id),
  templateVersionNumber: integer("template_version"),
  provider: varchar("provider"),
  model: varchar("model"),
  status: runStatusEnum("status").default("pending"),
  contextRefs: jsonb("context_refs"),
  auditData: jsonb("audit_data"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const runItems = pgTable("run_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  sourceItemId: varchar("source_item_id"),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  status: itemStatusEnum("status").default("pending"),
  isSelected: boolean("is_selected").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  appliedAt: timestamp("applied_at"),
});

export const secrets = pgTable(
  "secrets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    provider: varchar("provider").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_secrets_project_provider").on(table.projectId, table.provider),
  ],
);

export const projectAudit = pgTable("project_audit", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  detailsJson: jsonb("details_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaces),
  workspaceMembers: many(workspaceMembers),
  runs: many(runs),
  projectAudits: many(projectAudit),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
  members: many(workspaceMembers),
  projects: many(projects),
  projectAudits: many(projectAudit),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  defaultTemplate: one(templates, { fields: [projects.defaultTemplateId], references: [templates.id] }),
  owner: one(users, { fields: [projects.ownerUserId], references: [users.id] }),
  integrations: many(integrations),
  templates: many(templates),
  contexts: many(contexts),
  runs: many(runs),
  secrets: many(secrets),
  auditEntries: many(projectAudit),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
  project: one(projects, { fields: [integrations.projectId], references: [projects.id] }),
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
  project: one(projects, { fields: [templates.projectId], references: [projects.id] }),
  latestVersion: one(templateVersions, { fields: [templates.latestVersionId], references: [templateVersions.id] }),
  versions: many(templateVersions),
  auditEntries: many(templateAudit),
  runs: many(runs),
}));

export const templateVersionsRelations = relations(templateVersions, ({ one, many }) => ({
  template: one(templates, { fields: [templateVersions.templateId], references: [templates.id] }),
  auditEntries: many(templateAudit),
  runs: many(runs),
}));

export const templateAuditRelations = relations(templateAudit, ({ one }) => ({
  project: one(projects, { fields: [templateAudit.projectId], references: [projects.id] }),
  template: one(templates, { fields: [templateAudit.templateId], references: [templates.id] }),
  templateVersion: one(templateVersions, { fields: [templateAudit.templateVersionId], references: [templateVersions.id] }),
  actor: one(users, { fields: [templateAudit.actorUserId], references: [users.id] }),
}));

export const contextsRelations = relations(contexts, ({ one, many }) => ({
  project: one(projects, { fields: [contexts.projectId], references: [projects.id] }),
  chunks: many(contextChunks),
}));

export const contextChunksRelations = relations(contextChunks, ({ one }) => ({
  context: one(contexts, { fields: [contextChunks.contextId], references: [contexts.id] }),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  user: one(users, { fields: [runs.userId], references: [users.id] }),
  project: one(projects, { fields: [runs.projectId], references: [projects.id] }),
  template: one(templates, { fields: [runs.templateId], references: [templates.id] }),
  templateVersion: one(templateVersions, { fields: [runs.templateVersionId], references: [templateVersions.id] }),
  items: many(runItems),
}));

export const runItemsRelations = relations(runItems, ({ one }) => ({
  run: one(runs, { fields: [runItems.runId], references: [runs.id] }),
}));

export const secretsRelations = relations(secrets, ({ one }) => ({
  project: one(projects, { fields: [secrets.projectId], references: [projects.id] }),
}));

export const projectAuditRelations = relations(projectAudit, ({ one }) => ({
  workspace: one(workspaces, { fields: [projectAudit.workspaceId], references: [workspaces.id] }),
  project: one(projects, { fields: [projectAudit.projectId], references: [projects.id] }),
  actor: one(users, { fields: [projectAudit.actorUserId], references: [users.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).pick({
  name: true,
  billingInfo: true,
});

export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers).pick({
  workspaceId: true,
  userId: true,
  role: true,
});

export const insertProjectSchema = createInsertSchema(projects).pick({
  workspaceId: true,
  name: true,
  description: true,
  status: true,
  ownerUserId: true,
  llmProviderConfig: true,
}).extend({
  status: z.enum(projectStatusValues).optional(),
});

export const insertIntegrationSchema = createInsertSchema(integrations).pick({
  projectId: true,
  type: true,
  credentialsRef: true,
  metadata: true,
});

export const insertTemplateSchema = createInsertSchema(templates).pick({
  projectId: true,
  name: true,
  description: true,
  createdBy: true,
  updatedBy: true,
});

export const insertTemplateVersionSchema = createInsertSchema(templateVersions).pick({
  templateId: true,
  version: true,
  status: true,
  body: true,
  variablesJson: true,
  examplePayloadJson: true,
  publishedAt: true,
  publishedBy: true,
  createdBy: true,
});

export const insertTemplateAuditSchema = createInsertSchema(templateAudit).pick({
  projectId: true,
  templateId: true,
  templateVersionId: true,
  actorUserId: true,
  action: true,
  detailsJson: true,
});

export const insertContextSchema = createInsertSchema(contexts).pick({
  projectId: true,
  sourceType: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  storagePath: true,
  metadata: true,
});

export const insertRunSchema = createInsertSchema(runs).pick({
  projectId: true,
  templateId: true,
  templateVersionId: true,
  templateVersionNumber: true,
  provider: true,
  model: true,
  contextRefs: true,
});

export const insertSecretSchema = createInsertSchema(secrets).pick({
  projectId: true,
  provider: true,
  encryptedValue: true,
});

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectStatus = (typeof projectStatusValues)[number];
export type Integration = typeof integrations.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type TemplateVersion = typeof templateVersions.$inferSelect;
export type TemplateAudit = typeof templateAudit.$inferSelect;
export type Context = typeof contexts.$inferSelect;
export type ContextChunk = typeof contextChunks.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type RunItem = typeof runItems.$inferSelect;
export type Secret = typeof secrets.$inferSelect;
export type ProjectAudit = typeof projectAudit.$inferSelect;

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type InsertTemplateVersion = z.infer<typeof insertTemplateVersionSchema>;
export type InsertTemplateAudit = z.infer<typeof insertTemplateAuditSchema>;
export type InsertContext = z.infer<typeof insertContextSchema>;
export type InsertRun = z.infer<typeof insertRunSchema>;
export type InsertSecret = z.infer<typeof insertSecretSchema>;
export type InsertProjectAudit = typeof projectAudit.$inferInsert;
