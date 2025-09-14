import {
  users,
  workspaces,
  workspaceMembers,
  projects,
  integrations,
  templates,
  contexts,
  contextChunks,
  runs,
  runItems,
  secrets,
  type User,
  type UpsertUser,
  type Workspace,
  type WorkspaceMember,
  type Project,
  type Integration,
  type Template,
  type Context,
  type ContextChunk,
  type Run,
  type RunItem,
  type Secret,
  type InsertWorkspace,
  type InsertWorkspaceMember,
  type InsertProject,
  type InsertIntegration,
  type InsertTemplate,
  type InsertContext,
  type InsertRun,
  type InsertSecret,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser & { id: string }): Promise<User>;

  // Workspace operations
  getWorkspacesByUserId(userId: string): Promise<Workspace[]>;
  createWorkspace(workspace: InsertWorkspace & { ownerId: string }): Promise<Workspace>;
  getWorkspaceMembers(workspaceId: string): Promise<(WorkspaceMember & { user: User })[]>;
  addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember>;
  updateWorkspaceMemberRole(workspaceId: string, userId: string, role: "owner" | "admin" | "contributor" | "viewer"): Promise<void>;
  getUserWorkspaceRole(workspaceId: string, userId: string): Promise<"owner" | "admin" | "contributor" | "viewer" | null>;

  // Project operations
  getProjectsByWorkspaceId(workspaceId: string): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(projectId: string, updates: Partial<InsertProject>): Promise<Project>;

  // Integration operations
  getIntegrationsByProjectId(projectId: string): Promise<Integration[]>;
  getIntegration(integrationId: string): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(integrationId: string, updates: Partial<InsertIntegration>): Promise<Integration>;

  // Template operations
  getTemplatesByProjectId(projectId: string): Promise<Template[]>;
  getTemplate(templateId: string): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(templateId: string, updates: Partial<InsertTemplate>): Promise<Template>;

  // Context operations
  getContextsByProjectId(projectId: string): Promise<Context[]>;
  getContext(contextId: string): Promise<Context | undefined>;
  createContext(context: InsertContext): Promise<Context>;
  getContextChunks(contextId: string): Promise<ContextChunk[]>;
  createContextChunk(chunk: { contextId: string; text: string; embedding?: string; chunkMeta?: any }): Promise<ContextChunk>;

  // Run operations
  getRunsByProjectId(projectId: string): Promise<(Run & { template: Template | null })[]>;
  getRun(runId: string): Promise<Run | undefined>;
  createRun(run: InsertRun & { userId: string }): Promise<Run>;
  updateRun(runId: string, updates: Partial<Run>): Promise<Run>;
  getRunItems(runId: string): Promise<RunItem[]>;
  createRunItem(item: { runId: string; sourceItemId?: string; beforeJson?: any; afterJson?: any }): Promise<RunItem>;
  updateRunItem(itemId: string, updates: Partial<RunItem>): Promise<RunItem>;

  // Secret operations
  getSecret(projectId: string, provider: string): Promise<Secret | undefined>;
  upsertSecret(secret: InsertSecret): Promise<Secret>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser & { id: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Workspace operations
  async getWorkspacesByUserId(userId: string): Promise<Workspace[]> {
    const result = await db
      .select({ workspace: workspaces })
      .from(workspaces)
      .leftJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaces.name));
    
    return result.map(r => r.workspace);
  }

  async createWorkspace(workspace: InsertWorkspace & { ownerId: string }): Promise<Workspace> {
    const [newWorkspace] = await db.insert(workspaces).values(workspace).returning();
    
    // Add owner as workspace member
    await db.insert(workspaceMembers).values({
      workspaceId: newWorkspace.id,
      userId: workspace.ownerId,
      role: "owner",
    });

    return newWorkspace;
  }

  async getWorkspaceMembers(workspaceId: string): Promise<(WorkspaceMember & { user: User })[]> {
    const result = await db
      .select()
      .from(workspaceMembers)
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId));

    return result.map(r => ({
      ...r.workspace_members,
      user: r.users!,
    }));
  }

  async addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember> {
    const [newMember] = await db.insert(workspaceMembers).values(member).returning();
    return newMember;
  }

  async updateWorkspaceMemberRole(workspaceId: string, userId: string, role: "owner" | "admin" | "contributor" | "viewer"): Promise<void> {
    await db
      .update(workspaceMembers)
      .set({ role })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  }

  async getUserWorkspaceRole(workspaceId: string, userId: string): Promise<"owner" | "admin" | "contributor" | "viewer" | null> {
    const [member] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
    
    return member?.role || null;
  }

  // Project operations
  async getProjectsByWorkspaceId(workspaceId: string): Promise<Project[]> {
    return await db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(asc(projects.name));
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async updateProject(projectId: string, updates: Partial<InsertProject>): Promise<Project> {
    const [updatedProject] = await db
      .update(projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    return updatedProject;
  }

  // Integration operations
  async getIntegrationsByProjectId(projectId: string): Promise<Integration[]> {
    return await db
      .select()
      .from(integrations)
      .where(eq(integrations.projectId, projectId))
      .orderBy(asc(integrations.type));
  }

  async getIntegration(integrationId: string): Promise<Integration | undefined> {
    const [integration] = await db.select().from(integrations).where(eq(integrations.id, integrationId));
    return integration;
  }

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const [newIntegration] = await db.insert(integrations).values(integration).returning();
    return newIntegration;
  }

  async updateIntegration(integrationId: string, updates: Partial<InsertIntegration>): Promise<Integration> {
    const [updatedIntegration] = await db
      .update(integrations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(integrations.id, integrationId))
      .returning();
    return updatedIntegration;
  }

  // Template operations
  async getTemplatesByProjectId(projectId: string): Promise<Template[]> {
    return await db
      .select()
      .from(templates)
      .where(and(eq(templates.projectId, projectId), eq(templates.isActive, true)))
      .orderBy(asc(templates.name));
  }

  async getTemplate(templateId: string): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, templateId));
    return template;
  }

  async createTemplate(template: InsertTemplate): Promise<Template> {
    const [newTemplate] = await db.insert(templates).values(template).returning();
    return newTemplate;
  }

  async updateTemplate(templateId: string, updates: Partial<InsertTemplate>): Promise<Template> {
    const [updatedTemplate] = await db
      .update(templates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(templates.id, templateId))
      .returning();
    return updatedTemplate;
  }

  // Context operations
  async getContextsByProjectId(projectId: string): Promise<Context[]> {
    return await db
      .select()
      .from(contexts)
      .where(eq(contexts.projectId, projectId))
      .orderBy(desc(contexts.createdAt));
  }

  async getContext(contextId: string): Promise<Context | undefined> {
    const [context] = await db.select().from(contexts).where(eq(contexts.id, contextId));
    return context;
  }

  async createContext(context: InsertContext): Promise<Context> {
    const [newContext] = await db.insert(contexts).values(context).returning();
    return newContext;
  }

  async getContextChunks(contextId: string): Promise<ContextChunk[]> {
    return await db
      .select()
      .from(contextChunks)
      .where(eq(contextChunks.contextId, contextId));
  }

  async createContextChunk(chunk: { contextId: string; text: string; embedding?: string; chunkMeta?: any }): Promise<ContextChunk> {
    const [newChunk] = await db.insert(contextChunks).values(chunk).returning();
    return newChunk;
  }

  // Run operations
  async getRunsByProjectId(projectId: string): Promise<(Run & { template: Template | null })[]> {
    const result = await db
      .select()
      .from(runs)
      .leftJoin(templates, eq(runs.templateId, templates.id))
      .where(eq(runs.projectId, projectId))
      .orderBy(desc(runs.createdAt));

    return result.map(r => ({
      ...r.runs,
      template: r.templates,
    }));
  }

  async getRun(runId: string): Promise<Run | undefined> {
    const [run] = await db.select().from(runs).where(eq(runs.id, runId));
    return run;
  }

  async createRun(run: InsertRun & { userId: string }): Promise<Run> {
    const [newRun] = await db.insert(runs).values(run).returning();
    return newRun;
  }

  async updateRun(runId: string, updates: Partial<Run>): Promise<Run> {
    const [updatedRun] = await db
      .update(runs)
      .set(updates)
      .where(eq(runs.id, runId))
      .returning();
    return updatedRun;
  }

  async getRunItems(runId: string): Promise<RunItem[]> {
    return await db
      .select()
      .from(runItems)
      .where(eq(runItems.runId, runId))
      .orderBy(asc(runItems.createdAt));
  }

  async createRunItem(item: { runId: string; sourceItemId?: string; beforeJson?: any; afterJson?: any }): Promise<RunItem> {
    const [newItem] = await db.insert(runItems).values(item).returning();
    return newItem;
  }

  async updateRunItem(itemId: string, updates: Partial<RunItem>): Promise<RunItem> {
    const [updatedItem] = await db
      .update(runItems)
      .set(updates)
      .where(eq(runItems.id, itemId))
      .returning();
    return updatedItem;
  }

  // Secret operations
  async getSecret(projectId: string, provider: string): Promise<Secret | undefined> {
    const [secret] = await db
      .select()
      .from(secrets)
      .where(and(eq(secrets.projectId, projectId), eq(secrets.provider, provider)));
    return secret;
  }

  async upsertSecret(secret: InsertSecret): Promise<Secret> {
    const [upsertedSecret] = await db
      .insert(secrets)
      .values(secret)
      .onConflictDoUpdate({
        target: [secrets.projectId, secrets.provider],
        set: {
          encryptedValue: secret.encryptedValue,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upsertedSecret;
  }
}

export const storage = new DatabaseStorage();
