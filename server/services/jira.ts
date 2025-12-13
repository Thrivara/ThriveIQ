import { Integration } from "@shared/schema";
import { storage } from "../storage";

export class JiraService {
  async getWorkItems(integration: Integration, filters: { type?: string; status?: string } = {}) {
    try {
      // Get Jira credentials
      const secret = await storage.getSecret(integration.projectId, 'jira');
      if (!secret) {
        throw new Error("Jira credentials not found");
      }

      // Decrypt credentials (simplified - would use proper encryption)
      const credentials = JSON.parse(secret.encryptedValue);
      const { baseUrl, email, apiToken } = credentials;

      // Build JQL query
      let jql = 'project = ' + (integration.metadata as any)?.projectKey;
      if (filters.type) {
        jql += ` AND issuetype = "${filters.type}"`;
      }
      if (filters.status) {
        jql += ` AND status = "${filters.status}"`;
      }
      jql += ' ORDER BY created DESC';

      const searchUrl = new URL(`${baseUrl}/rest/api/3/search/jql`);
      searchUrl.searchParams.set('jql', jql);
      searchUrl.searchParams.set('maxResults', '50');
      ['summary', 'description', 'issuetype', 'status', 'priority', 'assignee', 'updated', 'parent'].forEach((field) =>
        searchUrl.searchParams.append('fields', field),
      );

      const response = await fetch(searchUrl.toString(), {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform Jira issues to our format
      return data.issues.map((issue: any) => ({
        id: issue.key,
        type: issue.fields.issuetype.name,
        title: issue.fields.summary,
        description: issue.fields.description?.content?.map((c: any) => c.content?.map((cc: any) => cc.text).join(' ')).join('\n') || '',
        status: issue.fields.status.name,
        priority: issue.fields.priority?.name || 'Medium',
        assignee: issue.fields.assignee?.displayName || 'Unassigned',
        lastUpdated: new Date(issue.fields.updated).toLocaleDateString(),
        parentId: issue.fields.parent?.key,
        url: `${baseUrl}/browse/${issue.key}`,
      }));
    } catch (error) {
      console.error("Error fetching Jira work items:", error);
      throw error;
    }
  }

  async updateWorkItem(integration: Integration, issueKey: string, updates: any) {
    try {
      const secret = await storage.getSecret(integration.projectId, 'jira');
      if (!secret) {
        throw new Error("Jira credentials not found");
      }

      const credentials = JSON.parse(secret.encryptedValue);
      const { baseUrl, email, apiToken } = credentials;

      // Build update payload
      const updatePayload: any = {
        fields: {}
      };

      if (updates.title) {
        updatePayload.fields.summary = updates.title;
      }

      if (updates.description) {
        updatePayload.fields.description = {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: updates.description
                }
              ]
            }
          ]
        };
      }

      // Update the issue
      const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jira API error: ${response.status} ${errorText}`);
      }

      // Create sub-tasks if specified
      if (updates.tasks && updates.tasks.length > 0) {
        await this.createSubTasks(integration, issueKey, updates.tasks);
      }

      return { success: true, issueKey };
    } catch (error) {
      console.error("Error updating Jira work item:", error);
      throw error;
    }
  }

  private async createSubTasks(integration: Integration, parentKey: string, tasks: string[]) {
    try {
      const secret = await storage.getSecret(integration.projectId, 'jira');
      if (!secret) {
        throw new Error("Jira credentials not found");
      }

      const credentials = JSON.parse(secret.encryptedValue);
      const { baseUrl, email, apiToken } = credentials;

      for (const task of tasks) {
        const createPayload = {
          fields: {
            project: {
              key: (integration.metadata as any)?.projectKey
            },
            parent: {
              key: parentKey
            },
            summary: task,
            issuetype: {
              name: "Sub-task"
            }
          }
        };

        await fetch(`${baseUrl}/rest/api/3/issue`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(createPayload),
        });
      }
    } catch (error) {
      console.error("Error creating Jira sub-tasks:", error);
      // Don't throw - sub-task creation is not critical
    }
  }

  async testConnection(baseUrl: string, email: string, apiToken: string) {
    try {
      const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error("Error testing Jira connection:", error);
      return false;
    }
  }

  async getProjects(baseUrl: string, email: string, apiToken: string) {
    try {
      const response = await fetch(`${baseUrl}/rest/api/3/project`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Jira API error: ${response.status}`);
      }

      const projects = await response.json();
      return projects.map((project: any) => ({
        id: project.id,
        key: project.key,
        name: project.name,
      }));
    } catch (error) {
      console.error("Error fetching Jira projects:", error);
      throw error;
    }
  }
}

export const jiraService = new JiraService();
