import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import StatsCards from "@/components/dashboard/stats-cards";
import WorkItemsBrowser from "@/components/dashboard/work-items-browser";
import GenerationStatus from "@/components/dashboard/generation-status";
import QuickActions from "@/components/dashboard/quick-actions";
import IntegrationStatus from "@/components/dashboard/integration-status";
import PreviewDiff from "@/components/dashboard/preview-diff";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect to home if not authenticated
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

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-foreground">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6" data-testid="dashboard-main">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Stats Cards */}
        <StatsCards />

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Work Items Browser */}
          <div className="lg:col-span-2">
            <WorkItemsBrowser />
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            <GenerationStatus />
            <QuickActions />
            <IntegrationStatus />
          </div>
        </div>

        {/* Preview and Diff Section */}
        <PreviewDiff />
      </div>
    </main>
  );
}
