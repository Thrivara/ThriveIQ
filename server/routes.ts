import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { authenticate } from "./auth";
import { insertWorkspaceSchema, insertProjectSchema, insertTemplateSchema, insertIntegrationSchema, insertContextSchema, insertRunSchema, insertSecretSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { openaiService } from "./services/openai";
import { jiraService } from "./services/jira";
import { azureDevOpsService } from "./services/azureDevOps";
import { fileUploadService } from "./services/fileUpload";
import { embeddingsService } from "./services/embeddings";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Supabase Auth is token-based; no app-level setup required

  // Auth routes
  app.get('/api/auth/user', authenticate, async (req: any, res) => {
    try {
      const userId = req.user.id;
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.upsertUser({
          id: userId,
          email: req.user.email,
          firstName: undefined,
          lastName: undefined,
          profileImageUrl: undefined,
        });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Workspace routes
  app.get('/api/workspaces', authenticate, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const workspaces = await storage.getWorkspacesByUserId(userId);
      res.json(workspaces);
    } catch (error) {
      console.error("Error fetching workspaces:", error);
      res.status(500).json({ message: "Failed to fetch workspaces" });
    }
  });

  app.post('/api/workspaces', authenticate, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const validatedData = insertWorkspaceSchema.parse(req.body);
      const workspace = await storage.createWorkspace({ ...validatedData, ownerId: userId });
      res.json(workspace);
    } catch (error) {
      console.error("Error creating workspace:", error);
      res.status(500).json({ message: "Failed to create workspace" });
    }
  });

  app.get('/api/workspaces/:workspaceId/members', authenticate, async (req: any, res) => {
    try {
      const { workspaceId } = req.params;
      const userId = req.user.id;
      
      // Check user has access to workspace
      const role = await storage.getUserWorkspaceRole(workspaceId, userId);
      if (!role) {
        return res.status(403).json({ message: "Access denied" });
      }

      const members = await storage.getWorkspaceMembers(workspaceId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching workspace members:", error);
      res.status(500).json({ message: "Failed to fetch workspace members" });
    }
  });

  // Project routes
  app.get('/api/workspaces/:workspaceId/projects', authenticate, async (req: any, res) => {
    try {
      const { workspaceId } = req.params;
      const userId = req.user.id;
      
      // Check user has access to workspace
      const role = await storage.getUserWorkspaceRole(workspaceId, userId);
      if (!role) {
        return res.status(403).json({ message: "Access denied" });
      }

      const projects = await storage.getProjectsByWorkspaceId(workspaceId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.post('/api/workspaces/:workspaceId/projects', authenticate, async (req: any, res) => {
    try {
      const { workspaceId } = req.params;
      const userId = req.user.id;
      
      // Check user has admin access
      const role = await storage.getUserWorkspaceRole(workspaceId, userId);
      if (!role || !['owner', 'admin'].includes(role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const validatedData = insertProjectSchema.parse({ ...req.body, workspaceId });
      const project = await storage.createProject(validatedData);
      res.json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.get('/api/projects/:projectId', authenticate, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check user has access to workspace
      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  // Integration routes
  app.get('/api/projects/:projectId/integrations', authenticate, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role) {
        return res.status(403).json({ message: "Access denied" });
      }

      const integrations = await storage.getIntegrationsByProjectId(projectId);
      res.json(integrations);
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  app.post('/api/projects/:projectId/integrations', authenticate, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role || !['owner', 'admin'].includes(role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const validatedData = insertIntegrationSchema.parse({ ...req.body, projectId });
      const integration = await storage.createIntegration(validatedData);
      res.json(integration);
    } catch (error) {
      console.error("Error creating integration:", error);
      res.status(500).json({ message: "Failed to create integration" });
    }
  });

  // Secrets routes
  app.post('/api/projects/:projectId/secrets', authenticate, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role || !['owner', 'admin'].includes(role)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const validatedData = insertSecretSchema.parse({ ...req.body, projectId });
      const secret = await storage.upsertSecret(validatedData);
      res.json({ id: secret.id, projectId: secret.projectId, provider: secret.provider });
    } catch (error) {
      console.error("Error creating secret:", error);
      res.status(500).json({ message: "Failed to create secret" });
    }
  });

  // Integration testing routes
  app.post('/api/projects/:projectId/integrations/:integrationId/test', authenticate, async (req: any, res) => {
    try {
      const { projectId, integrationId } = req.params;
      const userId = req.user.claims.sub;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role) {
        return res.status(403).json({ message: "Access denied" });
      }

      const integration = await storage.getIntegration(integrationId);
      if (!integration || integration.projectId !== projectId) {
        return res.status(404).json({ message: "Integration not found" });
      }

      // Test the integration based on its type
      if (integration.type === 'azure_devops') {
        const { azureDevOpsService } = await import('./services/azureDevOps');
        
        // Get credentials for testing
        const secret = await storage.getSecret(projectId, 'azure_devops');
        if (!secret) {
          return res.status(400).json({ message: "Azure DevOps credentials not found" });
        }
        
        const credentials = JSON.parse(secret.encryptedValue);
        const { organization, personalAccessToken } = credentials;
        
        // Try to fetch projects as a connection test
        const projects = await azureDevOpsService.getProjects(organization, personalAccessToken);
        
        res.json({ 
          success: true, 
          message: "Connection successful",
          projects: projects.slice(0, 3) // Return first 3 projects as confirmation
        });
      } else if (integration.type === 'jira') {
        const { jiraService } = await import('./services/jira');
        
        // Try to fetch a few work items as a connection test
        const workItems = await jiraService.getWorkItems(integration, {});
        
        res.json({ 
          success: true, 
          message: "Connection successful",
          workItems: workItems.slice(0, 3)
        });
      } else {
        res.status(400).json({ message: `Testing not implemented for ${integration.type}` });
      }
    } catch (error) {
      console.error("Error testing integration:", error);
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed" 
      });
    }
  });

  // Template routes
  app.get('/api/projects/:projectId/templates', authenticate, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role) {
        return res.status(403).json({ message: "Access denied" });
      }

      const templates = await storage.getTemplatesByProjectId(projectId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  app.post('/api/projects/:projectId/templates', authenticate, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role || role === 'viewer') {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const validatedData = insertTemplateSchema.parse({ ...req.body, projectId });
      const template = await storage.createTemplate(validatedData);
      res.json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Context file routes
  app.get('/api/projects/:projectId/contexts', authenticate, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role) {
        return res.status(403).json({ message: "Access denied" });
      }

      const contexts = await storage.getContextsByProjectId(projectId);
      res.json(contexts);
    } catch (error) {
      console.error("Error fetching contexts:", error);
      res.status(500).json({ message: "Failed to fetch contexts" });
    }
  });

  app.post('/api/projects/:projectId/contexts/upload', authenticate, upload.single('file'), async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role || role === 'viewer') {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Process file upload
      const result = await fileUploadService.processUpload(req.file, projectId);
      
      // Generate embeddings for text content
      if (result.textContent) {
        await embeddingsService.generateEmbeddings(result.context.id, result.textContent);
      }

      res.json(result.context);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Work items routes (integration-specific)
  app.get('/api/projects/:projectId/work-items', authenticate, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const { type, status, integration } = req.query;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get work items from the specified integration
      let workItems = [];
      
      if (integration === 'jira') {
        const jiraIntegration = await storage.getIntegrationsByProjectId(projectId).then(integrations => 
          integrations.find(i => i.type === 'jira')
        );
        if (jiraIntegration) {
          workItems = await jiraService.getWorkItems(jiraIntegration, { type, status });
        }
      } else if (integration === 'azure_devops') {
        const azureIntegration = await storage.getIntegrationsByProjectId(projectId).then(integrations => 
          integrations.find(i => i.type === 'azure_devops')
        );
        if (azureIntegration) {
          workItems = await azureDevOpsService.getWorkItems(azureIntegration, { type, status });
        }
      }

      res.json(workItems);
    } catch (error) {
      console.error("Error fetching work items:", error);
      res.status(500).json({ message: "Failed to fetch work items" });
    }
  });

  // Run routes
  app.get('/api/projects/:projectId/runs', authenticate, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role) {
        return res.status(403).json({ message: "Access denied" });
      }

      const runs = await storage.getRunsByProjectId(projectId);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching runs:", error);
      res.status(500).json({ message: "Failed to fetch runs" });
    }
  });

  app.post('/api/projects/:projectId/runs', authenticate, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role || role === 'viewer') {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const { templateId, workItemIds, contextIds, provider = 'openai', model = 'gpt-5' } = req.body;
      
      // Create run record
      const run = await storage.createRun({
        projectId,
        userId,
        templateId,
        provider,
        model,
        contextRefs: { contextIds, workItemIds },
      });

      // Start background processing
      setImmediate(async () => {
        try {
          await openaiService.processRun(run.id, templateId, workItemIds, contextIds);
        } catch (error) {
          console.error("Error processing run:", error);
          await storage.updateRun(run.id, { status: 'failed' });
        }
      });

      res.json(run);
    } catch (error) {
      console.error("Error creating run:", error);
      res.status(500).json({ message: "Failed to create run" });
    }
  });

  app.get('/api/runs/:runId/items', authenticate, async (req: any, res) => {
    try {
      const { runId } = req.params;
      const userId = req.user.id;
      
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ message: "Run not found" });
      }

      const project = await storage.getProject(run.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role) {
        return res.status(403).json({ message: "Access denied" });
      }

      const items = await storage.getRunItems(runId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching run items:", error);
      res.status(500).json({ message: "Failed to fetch run items" });
    }
  });

  app.post('/api/runs/:runId/apply', authenticate, async (req: any, res) => {
    try {
      const { runId } = req.params;
      const { selectedItemIds } = req.body;
      const userId = req.user.id;
      
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(404).json({ message: "Run not found" });
      }

      const project = await storage.getProject(run.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const role = await storage.getUserWorkspaceRole(project.workspaceId, userId);
      if (!role || role === 'viewer') {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      // Apply selected items back to the integration
      const integrations = await storage.getIntegrationsByProjectId(run.projectId);
      const runItems = await storage.getRunItems(runId);
      const selectedItems = runItems.filter(item => selectedItemIds.includes(item.id));

      const results = [];
      for (const item of selectedItems) {
        try {
          // Determine which integration to use based on source item
          const integration = integrations.find(i => i.isActive);
          if (!integration) {
            throw new Error("No active integration found");
          }

          let result;
          if (integration.type === 'jira') {
            result = await jiraService.updateWorkItem(integration, item.sourceItemId!, item.afterJson);
          } else if (integration.type === 'azure_devops') {
            result = await azureDevOpsService.updateWorkItem(integration, item.sourceItemId!, item.afterJson);
          }

          await storage.updateRunItem(item.id, { 
            status: 'applied',
            appliedAt: new Date(),
          });

          results.push({ itemId: item.id, success: true, result });
        } catch (error) {
          console.error(`Error applying item ${item.id}:`, error);
          await storage.updateRunItem(item.id, { status: 'rejected' });
          const message = error instanceof Error ? error.message : String(error);
          results.push({ itemId: item.id, success: false, error: message });
        }
      }

      res.json({ results });
    } catch (error) {
      console.error("Error applying run items:", error);
      res.status(500).json({ message: "Failed to apply run items" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
