import { useState } from "react";
import { Link } from "wouter";
import { Check, ChevronDown } from "lucide-react";
import { useWorkspaceContext } from "@/context/workspace-context";
import { useCurrentProject } from "@/hooks/useCurrentProject";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function getInitials(name: string | undefined) {
  if (!name) return "W";
  const parts = name.trim().split(/\s+/);
  if (!parts.length) return "W";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .padEnd(2, "W");
}

export default function WorkspaceSelector() {
  const { workspaces, activeWorkspace, activeWorkspaceId, setActiveWorkspace } = useWorkspaceContext();
  const { projects, project, selectProject } = useCurrentProject();
  const [open, setOpen] = useState(false);

  const initials = getInitials(activeWorkspace?.name);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between" data-testid="workspace-selector">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 bg-secondary rounded flex items-center justify-center">
            <span className="text-xs font-medium">{initials}</span>
          </div>
          <div className="max-w-[160px]">
            <p className="text-sm font-medium truncate" data-testid="workspace-name">
              {activeWorkspace?.name || "Workspace"}
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid="project-name">
              {project?.name || "Select a project"}
            </p>
          </div>
        </div>
        <PopoverTrigger asChild>
          <button className="p-1 hover:bg-muted rounded" data-testid="workspace-selector-button" aria-label="Choose workspace">
            <ChevronDown className="w-4 h-4" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="py-2">
          <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Workspaces</p>
          <div className="max-h-48 overflow-auto">
            {workspaces.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No workspaces</p>
            ) : (
              workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <button
                    key={ws.id}
                    className={cn(
                      "w-full px-3 py-2 flex items-center justify-between text-sm hover:bg-muted transition-colors",
                      isActive && "bg-muted",
                    )}
                    onClick={() => setActiveWorkspace(ws.id)}
                  >
                    <div className="flex flex-col text-left">
                      <span className="font-medium truncate">{ws.name}</span>
                      <span className="text-xs text-muted-foreground">{ws.description || 'No description'}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {ws.role}
                      </Badge>
                      {isActive && <Check className="w-4 h-4 text-primary" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="border-t" />
        <div className="py-2">
          <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Projects</p>
          <div className="max-h-48 overflow-auto">
            {projects.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No projects</p>
            ) : (
              projects.map((p) => {
                const isActive = project?.id === p.id;
                return (
                  <button
                    key={p.id}
                    className={cn(
                      "w-full px-3 py-2 text-sm flex items-center justify-between text-left hover:bg-muted transition-colors",
                      isActive && "bg-muted"
                    )}
                    onClick={() => {
                      selectProject(p.id);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{p.name}</span>
                    {isActive && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="border-t" />
        <div className="px-3 py-2">
          <Link
            href="/workspaces"
            className="text-sm text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            Manage workspace
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
