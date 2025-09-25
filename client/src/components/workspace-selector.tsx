import { ChevronDown, Check } from "lucide-react";
import { useCurrentProject } from "@/hooks/useCurrentProject";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function WorkspaceSelector() {
  const { workspaces, projects, project, selectProject } = useCurrentProject();
  const [open, setOpen] = useState(false);

  const ws = workspaces[0];
  const initials = (ws?.name || "W").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between" data-testid="workspace-selector">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-secondary rounded flex items-center justify-center">
            <span className="text-xs font-medium">{initials}</span>
          </div>
          <div>
            <p className="text-sm font-medium" data-testid="workspace-name">
              {ws?.name || "Workspace"}
            </p>
            <p className="text-xs text-muted-foreground truncate max-w-[150px]" data-testid="project-name">
              {project?.name || "Select a project"}
            </p>
          </div>
        </div>
        <PopoverTrigger asChild>
          <button className="p-1 hover:bg-muted rounded" data-testid="workspace-selector-button">
            <ChevronDown className="w-4 h-4" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 text-xs text-muted-foreground">Projects</div>
        <div className="max-h-60 overflow-auto py-1">
          {projects.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No projects</div>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between",
                  project?.id === p.id && "bg-muted"
                )}
                onClick={() => {
                  selectProject(p.id);
                  setOpen(false);
                }}
              >
                <span className="truncate">{p.name}</span>
                {project?.id === p.id && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
