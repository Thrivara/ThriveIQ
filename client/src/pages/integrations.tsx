import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { GitBranch, Plus, Settings, CheckCircle, XCircle, Loader2, TestTube, Trash2, Workflow } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useCurrentProject } from "@/hooks/useCurrentProject";
import type { Integration } from "@shared/schema";

// Use current project derived from the user's first workspace/projects

const azureDevOpsFormSchema = z.object({
  organization: z.string().min(1, "Organization is required"),
  project: z.string().min(1, "Project is required"),
  personalAccessToken: z.string().min(1, "Personal Access Token is required"),
});

type AzureDevOpsFormData = z.infer<typeof azureDevOpsFormSchema>;

const jiraFormSchema = z.object({
  baseUrl: z.string().url("Base URL must be a valid https:// URL"),
  projectKey: z.string().min(1, "Project key is required"),
  email: z.string().email("Email is required"),
  apiToken: z.string().min(1, "API token is required"),
  storyPointsFieldId: z.string().optional(),
  sprintFieldId: z.string().optional(),
  testCaseIssueType: z.string().optional(),
});

type JiraFormData = z.infer<typeof jiraFormSchema>;

export default function Integrations() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const { projectId, isLoading: loadingProject } = useCurrentProject();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIntegration, setEditIntegration] = useState<Integration | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  const [formType, setFormType] = useState<Integration["type"]>("azure_devops");
  const azureForm = useForm<AzureDevOpsFormData>({
    resolver: zodResolver(azureDevOpsFormSchema),
    defaultValues: {
      organization: "",
      project: "",
      personalAccessToken: "",
    },
  });
  const jiraForm = useForm<JiraFormData>({
    resolver: zodResolver(jiraFormSchema),
    defaultValues: {
      baseUrl: "",
      projectKey: "",
      email: "",
      apiToken: "",
      storyPointsFieldId: "",
      sprintFieldId: "",
      testCaseIssueType: "",
    },
  });
  const activeForm = formType === "azure_devops" ? azureForm : jiraForm;

  const getTrackerLabel = (type: Integration["type"]) => {
    if (type === "jira") return "Jira Cloud";
    if (type === "azure_devops") return "Azure DevOps";
    return type;
  };
  const buildTrackerPayload = (
    type: Integration["type"],
    values: AzureDevOpsFormData | JiraFormData,
  ) => {
    if (type === "azure_devops") {
      const data = values as AzureDevOpsFormData;
      const org = data.organization.trim();
      const proj = data.project.trim();
      return {
        secret: {
          organization: org,
          project: proj,
          personalAccessToken: data.personalAccessToken.trim(),
        },
        metadata: {
          organization: org,
          project: proj,
        },
      };
    }
    const data = values as JiraFormData;
    const baseUrl = data.baseUrl.trim().replace(/\/$/, "");
    const optional = (value?: string) => (value && value.trim().length ? value.trim() : null);
    return {
      secret: {
        baseUrl,
        email: data.email.trim(),
        apiToken: data.apiToken.trim(),
      },
      metadata: {
        baseUrl,
        projectKey: data.projectKey.trim(),
        email: data.email.trim(),
        storyPointsFieldId: optional(data.storyPointsFieldId),
        sprintFieldId: optional(data.sprintFieldId),
        testCaseIssueType: optional(data.testCaseIssueType),
      },
    };
  };

  type TrackerFormPayload =
    | { type: "azure_devops"; data: AzureDevOpsFormData }
    | { type: "jira"; data: JiraFormData };

  type TrackerUpdatePayload = TrackerFormPayload & { integrationId: string };

  // Fetch integrations
  const { data: integrations = [], isLoading: integrationsLoading } = useQuery<Integration[]>({
    queryKey: projectId ? ["/api/projects", projectId, "integrations"] : ["disabled"],
    enabled: !!projectId && isAuthenticated,
  });

  // Create integration mutation
  const createIntegrationMutation = useMutation({
    mutationFn: async (payload: TrackerFormPayload) => {
      if (!projectId) throw new Error("No project selected");
      const { secret, metadata } = buildTrackerPayload(payload.type, payload.data);
      await apiRequest("POST", `/api/projects/${projectId}/secrets`, {
        provider: payload.type,
        encryptedValue: JSON.stringify(secret),
      });
      return apiRequest("POST", `/api/projects/${projectId}/integrations`, {
        type: payload.type,
        metadata,
      });
    },
    onSuccess: () => {
      if (projectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
      setDialogOpen(false);
      azureForm.reset();
      jiraForm.reset();
      setEditIntegration(null);
      setFormType("azure_devops");
      toast({
        title: "Success",
        description: "Integration created successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create integration",
        variant: "destructive",
      });
    },
  });

  // Update integration metadata and/or PAT
  const updateIntegrationMutation = useMutation({
    mutationFn: async ({ integrationId, data, type }: TrackerUpdatePayload) => {
      if (!projectId) throw new Error("No project selected");
      const { secret, metadata } = buildTrackerPayload(type, data);
      await apiRequest("POST", `/api/projects/${projectId}/secrets`, {
        provider: type,
        encryptedValue: JSON.stringify(secret),
      });
      return apiRequest("PATCH", `/api/projects/${projectId}/integrations/${integrationId}`, {
        metadata,
      });
    },
    onSuccess: () => {
      if (projectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
      setDialogOpen(false);
      setEditIntegration(null);
      azureForm.reset();
      jiraForm.reset();
      setFormType("azure_devops");
      toast({ title: "Updated", description: "Integration updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update integration", variant: "destructive" });
    },
  });

  const deleteIntegrationMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      if (!projectId) throw new Error('No project selected');
      return apiRequest("DELETE", `/api/projects/${projectId}/integrations/${integrationId}`);
    },
    onSuccess: () => {
      if (projectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
      toast({ title: "Removed", description: "Integration removed." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove integration", variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (integration: Integration) => {
      if (!projectId) throw new Error('No project selected');
      return apiRequest("PATCH", `/api/projects/${projectId}/integrations/${integration.id}`, {
        isActive: !integration.isActive,
      });
    },
    onSuccess: () => {
      if (projectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async ({ integrationId }: { integrationId: string; label?: string }) => {
      if (!projectId) throw new Error('No project selected');
      return apiRequest("POST", `/api/projects/${projectId}/integrations/${integrationId}/test`);
    },
    onSuccess: (_data, variables) => {
      toast({
        title: "Connection Test Passed",
        description: variables?.label ? `Successfully connected to ${variables.label}!` : "Successfully connected to tracker!",
      });
      if (projectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Unable to connect to tracker",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setTestingConnection(null);
    },
  });

  const handleSubmit = (values: AzureDevOpsFormData | JiraFormData) => {
    const payload = { type: formType, data: values } as TrackerFormPayload;
    if (editIntegration) {
      updateIntegrationMutation.mutate({ ...payload, integrationId: editIntegration.id });
    } else {
      createIntegrationMutation.mutate(payload);
    }
  };

  const handleTestConnection = (integration: Integration) => {
    setTestingConnection(integration.id);
    testConnectionMutation.mutate({ integrationId: integration.id, label: getTrackerLabel(integration.type as Integration["type"]) });
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading || loadingProject || !isAuthenticated || !projectId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-foreground">Loading integrations...</span>
        </div>
      </div>
    );
  }

  const renderAzureFields = () => (
    <>
      <FormField
        control={azureForm.control}
        name="organization"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Organization</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Contoso" data-testid="input-organization" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={azureForm.control}
        name="project"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Project</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Project name" data-testid="input-project" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={azureForm.control}
        name="personalAccessToken"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Personal Access Token</FormLabel>
            <FormControl>
              <Input {...field} type="password" placeholder="Enter your PAT" data-testid="input-pat" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );

  const renderJiraFields = () => (
    <>
      <FormField
        control={jiraForm.control}
        name="baseUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Site Base URL</FormLabel>
            <FormControl>
              <Input {...field} placeholder="https://your-domain.atlassian.net" data-testid="input-jira-baseurl" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={jiraForm.control}
        name="projectKey"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Project Key</FormLabel>
            <FormControl>
              <Input {...field} placeholder="ABC" data-testid="input-jira-project" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={jiraForm.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Account Email</FormLabel>
            <FormControl>
              <Input {...field} placeholder="user@company.com" data-testid="input-jira-email" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={jiraForm.control}
        name="apiToken"
        render={({ field }) => (
          <FormItem>
            <FormLabel>API Token</FormLabel>
            <FormControl>
              <Input {...field} type="password" placeholder="Enter your Jira API token" data-testid="input-jira-token" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={jiraForm.control}
          name="storyPointsFieldId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Story Points Field ID (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="customfield_10016" data-testid="input-jira-storypoints" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={jiraForm.control}
          name="sprintFieldId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sprint Field ID (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="customfield_10020" data-testid="input-jira-sprint" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={jiraForm.control}
        name="testCaseIssueType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Test Case Issue Type (optional)</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Test" data-testid="input-jira-test-issue" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );

  return (
    <main className="flex-1 overflow-auto p-6" data-testid="integrations-main">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">Integrations</h1>
            <p className="text-muted-foreground">Connect and manage integrations with Azure DevOps, Jira, and other tools</p>
          </div>
          <Dialog
            open={dialogOpen}
            onOpenChange={(o) => {
              setDialogOpen(o);
              if (!o) {
                setEditIntegration(null);
                azureForm.reset();
                jiraForm.reset();
                setFormType("azure_devops");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-primary/80" data-testid="button-add-integration">
                <Plus className="w-4 h-4 mr-2" />
                Add Integration
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editIntegration ? `Configure ${getTrackerLabel(formType)}` : "Add Tracker Integration"}</DialogTitle>
              </DialogHeader>
              <Form {...activeForm}>
                <form onSubmit={activeForm.handleSubmit(handleSubmit)} className="space-y-4">
                  {!editIntegration && (
                    <div>
                      <Label>Integration Type</Label>
                      <Select
                        value={formType}
                        onValueChange={(value) => {
                          setFormType(value as Integration["type"]);
                          azureForm.reset();
                          jiraForm.reset();
                        }}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select tracker" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="azure_devops">Azure DevOps</SelectItem>
                          <SelectItem value="jira">Jira Cloud</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {formType === "azure_devops" ? renderAzureFields() : renderJiraFields()}
                  <div className="flex justify-end space-x-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createIntegrationMutation.isPending || updateIntegrationMutation.isPending}
                      data-testid="button-create-integration"
                    >
                      {(createIntegrationMutation.isPending || updateIntegrationMutation.isPending) && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      {editIntegration ? 'Save Changes' : 'Create Integration'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {integrationsLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="ml-2">Loading integrations...</span>
              </div>
            </CardContent>
          </Card>
        ) : integrations.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <GitBranch className="w-5 h-5" />
                <span>Integration Setup</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <GitBranch className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">No Integrations Configured</p>
                <p className="text-muted-foreground mb-6">
                  Connect your tracker to start syncing work items.
                </p>
                <Button onClick={() => setDialogOpen(true)} data-testid="button-get-started">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Integration
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {integrations.map((integration: Integration) => {
              const meta = (integration.metadata || {}) as Record<string, any>;
              const trackerLabel = getTrackerLabel(integration.type);
              const isAzure = integration.type === "azure_devops";
              const subtitle = isAzure
                ? `${meta?.organization ?? "—"}/${meta?.project ?? ""}`
                : `${meta?.baseUrl ?? "—"} • ${meta?.projectKey ?? ""}`;
              const Icon = isAzure ? GitBranch : Workflow;
              const iconClasses = isAzure
                ? "bg-blue-100 dark:bg-blue-900/20"
                : "bg-orange-100 dark:bg-orange-900/20";
              const iconColor = isAzure ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400";
              return (
                <Card key={integration.id} className="relative">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${iconClasses}`}>
                        <Icon className={`w-6 h-6 ${iconColor}`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{trackerLabel}</h3>
                        <p className="text-sm text-muted-foreground">{subtitle}</p>
                      </div>
                    </CardTitle>
                    <div className="flex items-center space-x-2">
                      <Badge
                        variant={integration.isActive ? "default" : "secondary"}
                        className={integration.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400" : ""}
                        data-testid={`status-${integration.id}`}
                      >
                        {integration.isActive ? (
                          <>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Connected
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 mr-1" />
                            Disconnected
                          </>
                        )}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Created {integration.createdAt ? new Date(integration.createdAt).toLocaleDateString() : 'Unknown'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Last updated {integration.updatedAt ? new Date(integration.updatedAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(integration)}
                        disabled={testingConnection === integration.id}
                        data-testid={`button-test-${integration.id}`}
                      >
                        {testingConnection === integration.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <TestTube className="w-4 h-4 mr-1" />
                        )}
                        Test Connection
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`button-configure-${integration.id}`}
                        onClick={() => {
                          setEditIntegration(integration);
                          setFormType(integration.type as Integration["type"]);
                          if (integration.type === "azure_devops") {
                            azureForm.reset({
                              organization: meta?.organization || "",
                              project: meta?.project || "",
                              personalAccessToken: "",
                            });
                          } else {
                            jiraForm.reset({
                              baseUrl: meta?.baseUrl || "",
                              projectKey: meta?.projectKey || "",
                              email: meta?.email || "",
                              apiToken: "",
                              storyPointsFieldId: meta?.storyPointsFieldId || "",
                              sprintFieldId: meta?.sprintFieldId || "",
                              testCaseIssueType: meta?.testCaseIssueType || "",
                            });
                          }
                          setDialogOpen(true);
                        }}
                      >
                        <Settings className="w-4 h-4 mr-1" />
                        Configure
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteIntegrationMutation.mutate(integration.id)}
                        data-testid={`button-delete-${integration.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                      <Button
                        variant={integration.isActive ? "outline" : "default"}
                        size="sm"
                        onClick={() => toggleActiveMutation.mutate(integration)}
                        data-testid={`button-toggle-${integration.id}`}
                      >
                        {integration.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
