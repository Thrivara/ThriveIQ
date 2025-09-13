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
import { GitBranch, Plus, Settings, CheckCircle, XCircle, Loader2, TestTube } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import type { Integration } from "@shared/schema";

// Hardcoded project ID for testing - in production, this would come from context/params
const TEST_PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

const azureDevOpsFormSchema = z.object({
  organization: z.string().min(1, "Organization is required"),
  project: z.string().min(1, "Project is required"),
  personalAccessToken: z.string().min(1, "Personal Access Token is required"),
});

type AzureDevOpsFormData = z.infer<typeof azureDevOpsFormSchema>;

export default function Integrations() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
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
    queryKey: ["/api/projects", TEST_PROJECT_ID, "integrations"],
    enabled: isAuthenticated,
  });

  // Create integration mutation
  const createIntegrationMutation = useMutation({
    mutationFn: async (data: AzureDevOpsFormData) => {
      // First, store the credentials securely
      await apiRequest("POST", `/api/projects/${TEST_PROJECT_ID}/secrets`, {
        provider: "azure_devops",
        encryptedValue: JSON.stringify(data),
      });

      // Then create the integration record
      return apiRequest("POST", `/api/projects/${TEST_PROJECT_ID}/integrations`, {
        type: "azure_devops",
        metadata: {
          organization: data.organization,
          project: data.project,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", TEST_PROJECT_ID, "integrations"] });
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

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      return apiRequest("POST", `/api/projects/${TEST_PROJECT_ID}/integrations/${integrationId}/test`);
    },
    onSuccess: () => {
      toast({
        title: "Connection Test Passed",
        description: "Successfully connected to Azure DevOps!",
      });
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
    createIntegrationMutation.mutate(data);
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
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading || !isAuthenticated) {
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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-primary/80" data-testid="button-add-integration">
                <Plus className="w-4 h-4 mr-2" />
                Add Integration
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add Azure DevOps Integration</DialogTitle>
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
                      disabled={createIntegrationMutation.isPending}
                      data-testid="button-create-integration"
                    >
                      {createIntegrationMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Create Integration
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
                      <Button variant="outline" size="sm" data-testid={`button-configure-${integration.id}`}>
                        <Settings className="w-4 h-4 mr-1" />
                        Configure
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