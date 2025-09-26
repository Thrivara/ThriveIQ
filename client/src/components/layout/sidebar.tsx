
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { requestSignOut } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import WorkspaceSelector from "@/components/workspace-selector";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Kanban,
  ClipboardList,
  FileText,
  Folder,
  GitBranch,
  History,
  Zap,
  MoreHorizontal,
  Users,
} from "lucide-react";

type AuthUser = {
  profileImageUrl?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Workspaces", href: "/workspaces", icon: Users },
  { name: "Projects", href: "/projects", icon: Kanban },
  { name: "Work Items", href: "/work-items", icon: ClipboardList },
  { name: "Templates", href: "/templates", icon: FileText },
  { name: "Context Files", href: "/context-files", icon: Folder },
  { name: "Integrations", href: "/integrations", icon: GitBranch },
  { name: "Audit Log", href: "/audit-log", icon: History },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth() as { user?: AuthUser };
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    try {
      setIsSigningOut(true);
      await requestSignOut();
      window.location.href = "/login";
    } catch (error) {
      console.error("Failed to sign out", error);
      setIsSigningOut(false);
    }
  };

  return (
    <div className="hidden md:flex md:w-64 md:flex-col">
      <div className="flex flex-col h-full bg-card border-r border-border">
        {/* Brand Header */}
        <div className="flex items-center px-6 py-4 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">ThriveIQ</h1>
              <p className="text-xs text-muted-foreground">AI Backlog Management</p>
            </div>
          </div>
        </div>

        {/* Workspace Selector */}
        <div className="px-4 py-3 border-b border-border">
          <WorkspaceSelector />
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 py-4 space-y-1" data-testid="sidebar-nav">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                data-testid={`nav-${item.name.toLowerCase().replace(" ", "-")}`}
              >
                <item.icon className="mr-3 w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User Menu */}
        <div className="px-4 py-4 space-y-3 border-t border-border">
          <div className="flex items-center space-x-3">
            {user?.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt="User avatar"
                className="w-8 h-8 rounded-full object-cover"
                data-testid="user-avatar"
              />
            ) : (
              <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
                <span className="text-xs font-medium">
                  {user?.firstName?.[0] || user?.email?.[0] || "U"}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid="user-name">
                {user?.firstName && user?.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user?.email || "User"}
              </p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
            <button 
              className="p-1 hover:bg-muted rounded"
              data-testid="user-menu-button"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center"
            onClick={handleSignOut}
            disabled={isSigningOut}
            data-testid="button-sign-out"
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      </div>
    </div>
  );
}
