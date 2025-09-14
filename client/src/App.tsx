import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import WorkItems from "@/pages/work-items";
import Templates from "@/pages/templates";
import ContextFiles from "@/pages/context-files";
import Integrations from "@/pages/integrations";
import AuditLog from "@/pages/audit-log";
import AppLayout from "@/components/layout/app-layout";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={() => {
          // Redirect to login for any protected route when not authenticated
          window.location.href = "/login";
          return (
            <div className="min-h-screen w-full flex items-center justify-center bg-background">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="text-foreground">Redirecting to login...</span>
              </div>
            </div>
          );
        }} />
      </Switch>
    );
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/work-items" component={WorkItems} />
        <Route path="/templates" component={Templates} />
        <Route path="/context-files" component={ContextFiles} />
        <Route path="/integrations" component={Integrations} />
        <Route path="/audit-log" component={AuditLog} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
