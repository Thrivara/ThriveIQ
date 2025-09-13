import { Integration } from "@shared/schema";
import { storage } from "../storage";

export class AzureDevOpsService {
  async getWorkItems(integration: Integration, filters: { type?: string; status?: string } = {}) {
    try {
      // Get Azure DevOps credentials
      const secret = await storage.getSecret(integration.projectId, 'azure_devops');
      if (!secret) {
        throw new Error("Azure DevOps credentials not found");
      }

      const credentials = JSON.parse(secret.encryptedValue);
      const { organization, project, personalAccessToken } = credentials;

      // Build WIQL query
      let wiql = `SELECT [System.Id], [System.Title], [System.Description], [System.WorkItemType], [System.State], [Microsoft.VSTS.Common.Priority], [System.AssignedTo], [System.ChangedDate] FROM WorkItems WHERE [System.TeamProject] = '${project}'`;
      
      if (filters.type) {
        wiql += ` AND [System.WorkItemType] = '${filters.type}'`;
      }
      if (filters.status) {
        wiql += ` AND [System.State] = '${filters.status}'`;
      }
      wiql += ' ORDER BY [System.ChangedDate] DESC';

      // Execute WIQL query
      const wiqlResponse = await fetch(`https://dev.azure.com/${organization}/${project}/_apis/wit/wiql?api-version=6.0`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${personalAccessToken}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: wiql }),
      });

      if (!wiqlResponse.ok) {
        throw new Error(`Azure DevOps API error: ${wiqlResponse.status} ${wiqlResponse.statusText}`);
      }

      const wiqlData = await wiqlResponse.json();
      const workItemIds = wiqlData.workItems.map((wi: any) => wi.id);

      if (workItemIds.length === 0) {
        return [];
      }

      // Get work item details
      const detailsResponse = await fetch(`https://dev.azure.com/${organization}/${project}/_apis/wit/workitems?ids=${workItemIds.join(',')}&api-version=6.0`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${personalAccessToken}`).toString('base64')}`,
        },
      });

      if (!detailsResponse.ok) {
        throw new Error(`Azure DevOps API error: ${detailsResponse.status} ${detailsResponse.statusText}`);
      }

      const detailsData = await detailsResponse.json();

      // Transform Azure DevOps work items to our format
      return detailsData.value.map((workItem: any) => ({
        id: workItem.id.toString(),
        type: workItem.fields['System.WorkItemType'],
        title: workItem.fields['System.Title'],
        description: workItem.fields['System.Description'] || '',
        status: workItem.fields['System.State'],
        priority: workItem.fields['Microsoft.VSTS.Common.Priority'] || 2,
        assignee: workItem.fields['System.AssignedTo']?.displayName || 'Unassigned',
        lastUpdated: new Date(workItem.fields['System.ChangedDate']).toLocaleDateString(),
        url: workItem._links.html.href,
      }));
    } catch (error) {
      console.error("Error fetching Azure DevOps work items:", error);
      throw error;
    }
  }

  async updateWorkItem(integration: Integration, workItemId: string, updates: any) {
    try {
      const secret = await storage.getSecret(integration.projectId, 'azure_devops');
      if (!secret) {
        throw new Error("Azure DevOps credentials not found");
      }

      const credentials = JSON.parse(secret.encryptedValue);
      const { organization, project, personalAccessToken } = credentials;

      // Build update operations
      const operations = [];

      if (updates.title) {
        operations.push({
          op: "replace",
          path: "/fields/System.Title",
          value: updates.title
        });
      }

      if (updates.description) {
        operations.push({
          op: "replace",
          path: "/fields/System.Description",
          value: updates.description
        });
      }

      if (updates.acceptanceCriteria) {
        operations.push({
          op: "replace",
          path: "/fields/Microsoft.VSTS.Common.AcceptanceCriteria",
          value: updates.acceptanceCriteria
        });
      }

      // Update the work item
      const response = await fetch(`https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}?api-version=6.0`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${personalAccessToken}`).toString('base64')}`,
          'Content-Type': 'application/json-patch+json',
        },
        body: JSON.stringify(operations),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure DevOps API error: ${response.status} ${errorText}`);
      }

      // Create child tasks if specified
      if (updates.tasks && updates.tasks.length > 0) {
        await this.createChildTasks(integration, workItemId, updates.tasks);
      }

      return { success: true, workItemId };
    } catch (error) {
      console.error("Error updating Azure DevOps work item:", error);
      throw error;
    }
  }

  private async createChildTasks(integration: Integration, parentId: string, tasks: string[]) {
    try {
      const secret = await storage.getSecret(integration.projectId, 'azure_devops');
      if (!secret) {
        throw new Error("Azure DevOps credentials not found");
      }

      const credentials = JSON.parse(secret.encryptedValue);
      const { organization, project, personalAccessToken } = credentials;

      for (const task of tasks) {
        // Create task
        const createOperations = [
          {
            op: "add",
            path: "/fields/System.Title",
            value: task
          },
          {
            op: "add",
            path: "/fields/System.WorkItemType",
            value: "Task"
          }
        ];

        const createResponse = await fetch(`https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/$Task?api-version=6.0`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Basic ${Buffer.from(`:${personalAccessToken}`).toString('base64')}`,
            'Content-Type': 'application/json-patch+json',
          },
          body: JSON.stringify(createOperations),
        });

        if (createResponse.ok) {
          const taskData = await createResponse.json();
          
          // Link to parent
          const linkOperations = [
            {
              op: "add",
              path: "/relations/-",
              value: {
                rel: "System.LinkTypes.Hierarchy-Reverse",
                url: `https://dev.azure.com/${organization}/${project}/_apis/wit/workItems/${parentId}`
              }
            }
          ];

          await fetch(`https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${taskData.id}?api-version=6.0`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Basic ${Buffer.from(`:${personalAccessToken}`).toString('base64')}`,
              'Content-Type': 'application/json-patch+json',
            },
            body: JSON.stringify(linkOperations),
          });
        }
      }
    } catch (error) {
      console.error("Error creating Azure DevOps child tasks:", error);
      // Don't throw - child task creation is not critical
    }
  }

  async testConnection(organization: string, project: string, personalAccessToken: string) {
    try {
      const response = await fetch(`https://dev.azure.com/${organization}/${project}/_apis/wit/workitemtypes?api-version=6.0`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${personalAccessToken}`).toString('base64')}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error("Error testing Azure DevOps connection:", error);
      return false;
    }
  }

  async getProjects(organization: string, personalAccessToken: string) {
    try {
      const response = await fetch(`https://dev.azure.com/${organization}/_apis/projects?api-version=6.0`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${personalAccessToken}`).toString('base64')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Azure DevOps API error: ${response.status}`);
      }

      const data = await response.json();
      return data.value.map((project: any) => ({
        id: project.id,
        name: project.name,
      }));
    } catch (error) {
      console.error("Error fetching Azure DevOps projects:", error);
      throw error;
    }
  }
}

export const azureDevOpsService = new AzureDevOpsService();
