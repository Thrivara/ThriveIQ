import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useCurrentProject } from "@/hooks/useCurrentProject";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";

export default function WorkItems() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const { projectId, isLoading: loadingProject } = useCurrentProject();

  // Always call hooks in the same order; use `enabled` to guard queries
  const { data, isLoading: itemsLoading, error } = useQuery<{ items: any[] }>({
    queryKey: projectId ? ["/api/projects", projectId, "work-items"] : ["disabled"],
    enabled: !!projectId && isAuthenticated && !isLoading && !loadingProject,
  });

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
          <span className="text-foreground">Loading work items...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6" data-testid="work-items-main">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Work Items</h1>
          <p className="text-muted-foreground">Browse and manage work items from your connected integrations</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <ClipboardList className="w-5 h-5" />
              <span>Work Items Browser</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {itemsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2">Loading work items...</span>
              </div>
            ) : error ? (
              <div className="text-sm text-red-600">{(error as any).message || 'Failed to load work items'}</div>
            ) : (data?.items?.length ?? 0) === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">No work items found</p>
                <p className="text-muted-foreground">Connect Azure DevOps and try again.</p>
              </div>
            ) : (
              <div className="divide-y">
                {data!.items.map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-medium">#{w.id} — {w.title}</div>
                      <div className="text-sm text-muted-foreground">{w.type} • {w.state} • {w.assignedTo ?? 'Unassigned'}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">{w.changedDate ? new Date(w.changedDate).toLocaleString() : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
