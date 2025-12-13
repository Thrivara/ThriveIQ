import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "./status-badge";
import { TrackerBadge } from "./tracker-badge";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal } from "lucide-react";

export interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  guardrails: string | null;
  status: "active" | "planning" | "review" | "archived";
  itemCount: number;
  memberCount: number;
  lastUpdated: string | null;
  ownerUserId: string | null;
  tracker: { type: "jira" | "azure_devops" | "none"; label: string };
  hasIntegrations: boolean;
  canArchive: boolean;
  canDelete: boolean;
  dependencies: {
    integrations: number;
    templates: number;
    contexts: number;
    runs: number;
  };
}

interface ProjectsTableProps {
  projects: ProjectListItem[];
  onViewDetails: (project: ProjectListItem) => void;
  onEdit: (project: ProjectListItem) => void;
  onArchive: (project: ProjectListItem) => void;
  onDelete: (project: ProjectListItem) => void;
  archiveLoadingId?: string | null;
  deleteLoadingId?: string | null;
}

export function ProjectsTable({
  projects,
  onViewDetails,
  onEdit,
  onArchive,
  onDelete,
  archiveLoadingId,
  deleteLoadingId,
}: ProjectsTableProps) {
  if (!projects.length) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
        <h3 className="text-lg font-semibold text-foreground">No projects yet</h3>
        <p className="text-sm text-muted-foreground">Create your first project to get started.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tracker</TableHead>
            <TableHead className="text-right">Items</TableHead>
            <TableHead className="text-right">Team</TableHead>
            <TableHead>Last Updated</TableHead>
            <TableHead className="w-[60px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => onViewDetails(project)}
                    className="text-left text-sm font-semibold text-primary hover:underline"
                  >
                    {project.name}
                  </button>
                  {project.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={project.status} />
              </TableCell>
              <TableCell>
                <TrackerBadge type={project.tracker.type} label={project.tracker.label} />
              </TableCell>
              <TableCell className="text-right text-sm font-medium">{project.itemCount}</TableCell>
              <TableCell className="text-right text-sm font-medium">{project.memberCount}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {project.lastUpdated
                  ? formatDistanceToNow(new Date(project.lastUpdated), { addSuffix: true })
                  : "—"}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => onViewDetails(project)}>View Details</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(project)}>Edit Project</DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!project.canArchive || archiveLoadingId === project.id}
                      onClick={() => onArchive(project)}
                    >
                      {archiveLoadingId === project.id ? "Archiving…" : "Archive"}
                    </DropdownMenuItem>
                    {project.canDelete ? (
                      <DropdownMenuItem
                        onClick={() => onDelete(project)}
                        disabled={deleteLoadingId === project.id}
                      >
                        {deleteLoadingId === project.id ? "Deleting…" : "Delete"}
                      </DropdownMenuItem>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem disabled className="cursor-not-allowed text-muted-foreground">
                            Delete
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs text-xs">
                          Remove all dependencies (integrations, templates, contexts, runs) before deleting.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
