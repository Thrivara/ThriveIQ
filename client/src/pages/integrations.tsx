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
import { GitBranch, Plus, Settings, CheckCircle, XCircle, Loader2, TestTube, Trash2 } from "lucide-react";
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

export default function Integrations() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const { projectId, isLoading: loadingProject } = useCurrentProject();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIntegration, setEditIntegration] = useState<Integration | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  const form = useForm<AzureDevOpsFormData>({
    resolver: zodResolver(azureDevOpsFormSchema),
    defaultValues: {
      organization: "",
      project: "",
      personalAccessToken: "",
    },
  });

  // Fetch integrations
  const { data: integrations = [], isLoading: integrationsLoading } = useQuery<Integration[]>({
    queryKey: projectId ? ["/api/projects", projectId, "integrations"] : ["disabled"],
    enabled: !!projectId && isAuthenticated,
  });

  // Create integration mutation
  const createIntegrationMutation = useMutation({
    mutationFn: async (data: AzureDevOpsFormData) => {
      // First, store the credentials securely
      if (!projectId) throw new Error('No project selected');
      await apiRequest("POST", `/api/projects/${projectId}/secrets`, {
        provider: "azure_devops",
        encryptedValue: JSON.stringify(data),
      });

      // Then create the integration record
      return apiRequest("POST", `/api/projects/${projectId}/integrations`, {
        type: "azure_devops",
        metadata: {
          organization: data.organization,
          project: data.project,
        },
      });
    },
    onSuccess: () => {
      if (projectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
      setDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Azure DevOps integration created successfully!",
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
    mutationFn: async ({ integrationId, data }: { integrationId: string; data: AzureDevOpsFormData }) => {
      if (!projectId) throw new Error('No project selected');
      // Update secret first (PAT)
      await apiRequest("POST", `/api/projects/${projectId}/secrets`, {
        provider: "azure_devops",
        encryptedValue: JSON.stringify(data),
      });
      // Update integration metadata
      return apiRequest("PATCH", `/api/projects/${projectId}/integrations/${integrationId}`, {
        metadata: { organization: data.organization, project: data.project },
      });
    },
    onSuccess: () => {
      if (projectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
      setDialogOpen(false);
      setEditIntegration(null);
      form.reset();
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
    mutationFn: async (integrationId: string) => {
      if (!projectId) throw new Error('No project selected');
      return apiRequest("POST", `/api/projects/${projectId}/integrations/${integrationId}/test`);
    },
    onSuccess: () => {
      toast({
        title: "Connection Test Passed",
        description: "Successfully connected to Azure DevOps!",
      });
      if (projectId) queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "integrations"] });
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Unable to connect to Azure DevOps",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setTestingConnection(null);
    },
  });

  const handleSubmit = (data: AzureDevOpsFormData) => {
    if (editIntegration) {
      updateIntegrationMutation.mutate({ integrationId: editIntegration.id, data });
    } else {
      createIntegrationMutation.mutate(data);
    }
  };

  const handleTestConnection = (integrationId: string) => {
    setTestingConnection(integrationId);
    testConnectionMutation.mutate(integrationId);
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

  return (
    <main className="flex-1 overflow-auto p-6" data-testid="integrations-main">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">Integrations</h1>
            <p className="text-muted-foreground">Connect and manage integrations with Azure DevOps, Jira, and other tools</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditIntegration(null); }}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-primary/80" data-testid="button-add-integration">
                <Plus className="w-4 h-4 mr-2" />
                Add Integration
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editIntegration ? 'Configure Azure DevOps' : 'Add Azure DevOps Integration'}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="organization"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g., mycompany"
                            data-testid="input-organization"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="project"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g., MyProject"
                            data-testid="input-project"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="personalAccessToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Personal Access Token</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Enter your PAT"
                            data-testid="input-pat"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                  Connect to Azure DevOps to start syncing your work items.
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
            {integrations.map((integration: Integration) => (
              <Card key={integration.id} className="relative">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                        <GitBranch className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Azure DevOps</h3>
                        <p className="text-sm text-muted-foreground">
                          {(integration.metadata as any)?.organization}/{(integration.metadata as any)?.project}
                        </p>
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
                        onClick={() => handleTestConnection(integration.id)}
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
                          form.reset({
                            organization: (integration.metadata as any)?.organization || '',
                            project: (integration.metadata as any)?.project || '',
                            personalAccessToken: '',
                          });
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
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
