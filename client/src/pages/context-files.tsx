import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Folder } from "lucide-react";

export default function ContextFiles() {
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
          <span className="text-foreground">Loading context files...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6" data-testid="context-files-main">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Context Files</h1>
          <p className="text-muted-foreground">Upload and manage project context files for AI generation</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Folder className="w-5 h-5" />
              <span>File Management</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">File Upload Interface Coming Soon</p>
              <p className="text-muted-foreground">
                Upload DOCX, PDF, MD, and other files to provide context for AI generation.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
