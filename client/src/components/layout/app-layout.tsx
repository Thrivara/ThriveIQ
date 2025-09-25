import { ReactNode, useMemo } from "react";
import { useLocation } from "wouter";
import Sidebar from "./sidebar";
import Header from "./header";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  const headerContent = useMemo(() => {
    if (!location) {
      return {
        title: "Dashboard",
        description: "Generate and manage backlog items with AI",
      };
    }

    if (location.startsWith("/projects")) {
      return {
        title: "Projects",
        description: "Manage your projects and track progress",
      };
    }

    if (location.startsWith("/work-items")) {
      return {
        title: "Work Items",
        description: "Browse and manage work items from your connected integrations",
      };
    }

    if (location.startsWith("/templates")) {
      return {
        title: "Templates",
        description: "Create reusable AI generation templates",
      };
    }

    if (location.startsWith("/context-files")) {
      return {
        title: "Context Files",
        description: "Manage project context and supporting documents",
      };
    }

    if (location.startsWith("/integrations")) {
      return {
        title: "Integrations",
        description: "Connect Jira, Azure DevOps, and other tools",
      };
    }

    if (location.startsWith("/audit-log")) {
      return {
        title: "Audit Log",
        description: "Review activity across your workspace",
      };
    }

    return {
      title: "Dashboard",
      description: "Generate and manage backlog items with AI",
    };
  }, [location]);

  return (
    <div className="flex h-screen overflow-hidden" data-testid="app-layout">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={headerContent.title}
          description={headerContent.description}
        />
        {children}
      </div>
    </div>
  );
}
