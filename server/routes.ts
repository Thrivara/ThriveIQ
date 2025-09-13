import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertWorkspaceSchema, insertProjectSchema, insertTemplateSchema, insertIntegrationSchema, insertContextSchema, insertRunSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import { openaiService } from "./services/openai";
import { jiraService } from "./services/jira";
import { azureDevOpsService } from "./services/azureDevOps";
import { fileUploadService } from "./services/fileUpload";
import { embeddingsService } from "./services/embeddings";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Workspace routes
  app.get('/api/workspaces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspaces = await storage.getWorkspacesByUserId(userId);
      res.json(workspaces);
    } catch (error) {
      console.error("Error fetching workspaces:", error);
      res.status(500).json({ message: "Failed to fetch workspaces" });
    }
  });

  app.post('/api/workspaces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertWorkspaceSchema.parse(req.body);
      const workspace = await storage.createWorkspace({ ...validatedData, ownerId: userId });
      res.json(workspace);
    } catch (error) {
      console.error("Error creating workspace:", error);
      res.status(500).json({ message: "Failed to create workspace" });
    }
  });

  app.get('/api/workspaces/:workspaceId/members', isAuthenticated, async (req: any, res) => {
    try {
      const { workspaceId } = req.params;
      const userId = req.user.claims.sub;
      
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
  app.get('/api/workspaces/:workspaceId/projects', isAuthenticated, async (req: any, res) => {
    try {
      const { workspaceId } = req.params;
      const userId = req.user.claims.sub;
      
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

  app.post('/api/workspaces/:workspaceId/projects', isAuthenticated, async (req: any, res) => {
    try {
      const { workspaceId } = req.params;
      const userId = req.user.claims.sub;
      
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

  app.get('/api/projects/:projectId', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      
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
  app.get('/api/projects/:projectId/integrations', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      
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

  app.post('/api/projects/:projectId/integrations', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      
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

  // Template routes
  app.get('/api/projects/:projectId/templates', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      
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

  app.post('/api/projects/:projectId/templates', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      
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
  app.get('/api/projects/:projectId/contexts', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      
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

  app.post('/api/projects/:projectId/contexts/upload', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      
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
  app.get('/api/projects/:projectId/work-items', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const { type, status, integration } = req.query;
      const userId = req.user.claims.sub;
      
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
  app.get('/api/projects/:projectId/runs', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      
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

  app.post('/api/projects/:projectId/runs', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      
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

  app.get('/api/runs/:runId/items', isAuthenticated, async (req: any, res) => {
    try {
      const { runId } = req.params;
      const userId = req.user.claims.sub;
      
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

  app.post('/api/runs/:runId/apply', isAuthenticated, async (req: any, res) => {
    try {
      const { runId } = req.params;
      const { selectedItemIds } = req.body;
      const userId = req.user.claims.sub;
      
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
          results.push({ itemId: item.id, success: false, error: error.message });
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
