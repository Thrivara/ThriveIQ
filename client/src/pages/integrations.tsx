import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch } from "lucide-react";

export default function Integrations() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

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
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground">Connect and manage integrations with Jira, Azure DevOps, and other tools</p>
        </div>

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
              <p className="text-lg font-medium mb-2">Integration Management Coming Soon</p>
              <p className="text-muted-foreground">
                Set up and configure integrations with your favorite tools.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
