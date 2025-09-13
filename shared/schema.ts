import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
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

// Session storage table (mandatory for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Enums
export const roleEnum = pgEnum("role", ["owner", "admin", "contributor", "viewer"]);
export const integrationTypeEnum = pgEnum("integration_type", ["jira", "azure_devops", "confluence", "sharepoint"]);
export const sourceTypeEnum = pgEnum("source_type", ["upload", "confluence", "sharepoint"]);
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "completed", "failed"]);
export const itemStatusEnum = pgEnum("item_status", ["pending", "generated", "applied", "rejected"]);

// Core tables
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  billingInfo: jsonb("billing_info"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  defaultTemplateId: uuid("default_template_id"),
  llmProviderConfig: jsonb("llm_provider_config"),
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

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  body: text("body").notNull(),
  variables: jsonb("variables"),
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contexts = pgTable("contexts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sourceType: sourceTypeEnum("source_type").notNull(),
  fileName: varchar("file_name"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  storagePath: varchar("storage_path"),
  metadata: jsonb("metadata"),
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
  userId: varchar("user_id").notNull().references(() => users.id),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => templates.id),
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

export const secrets = pgTable("secrets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  provider: varchar("provider").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaces),
  workspaceMembers: many(workspaceMembers),
  runs: many(runs),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
  members: many(workspaceMembers),
  projects: many(projects),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  defaultTemplate: one(templates, { fields: [projects.defaultTemplateId], references: [templates.id] }),
  integrations: many(integrations),
  templates: many(templates),
  contexts: many(contexts),
  runs: many(runs),
  secrets: many(secrets),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
  project: one(projects, { fields: [integrations.projectId], references: [projects.id] }),
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
  project: one(projects, { fields: [templates.projectId], references: [projects.id] }),
  runs: many(runs),
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
  items: many(runItems),
}));

export const runItemsRelations = relations(runItems, ({ one }) => ({
  run: one(runs, { fields: [runItems.runId], references: [runs.id] }),
}));

export const secretsRelations = relations(secrets, ({ one }) => ({
  project: one(projects, { fields: [secrets.projectId], references: [projects.id] }),
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
  llmProviderConfig: true,
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
  body: true,
  variables: true,
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
export type Integration = typeof integrations.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type Context = typeof contexts.$inferSelect;
export type ContextChunk = typeof contextChunks.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type RunItem = typeof runItems.$inferSelect;
export type Secret = typeof secrets.$inferSelect;

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type InsertContext = z.infer<typeof insertContextSchema>;
export type InsertRun = z.infer<typeof insertRunSchema>;
export type InsertSecret = z.infer<typeof insertSecretSchema>;
