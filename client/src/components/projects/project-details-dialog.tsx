import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./status-badge";
import { TrackerBadge } from "./tracker-badge";
import { formatDistanceToNow } from "date-fns";

interface ProjectDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  workspaceId: string | null;
}

interface ProjectDetailResponse {
  project: {
    id: string;
    name: string;
    description: string | null;
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
    integrations: Array<{
      id: string;
      type: string;
      isActive: boolean;
      createdAt: string | null;
      metadata: Record<string, unknown> | null;
    }>;
    teamMembers: Array<{
      userId: string;
      user: {
        id: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
      } | null;
    }>;
  };
  audit: Array<{
    id: string;
    action: string;
    actorUserId: string;
    detailsJson: Record<string, unknown> | null;
    createdAt: string;
    actor?: {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }>;
}

function AuditTimeline({ entries }: { entries: ProjectDetailResponse["audit"] }) {
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">No recent activity.</p>;
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const actorName = entry.actor
          ? entry.actor.firstName && entry.actor.lastName
            ? `${entry.actor.firstName} ${entry.actor.lastName}`
            : entry.actor.email ?? entry.actor.id
          : "Unknown";
        const timestamp = formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true });
        return (
          <li key={entry.id} className="text-sm">
            <div className="font-medium text-foreground capitalize">{entry.action}</div>
            <div className="text-muted-foreground">
              {actorName} • {timestamp}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ProjectDetailsDialog({ open, onOpenChange, projectId, workspaceId }: ProjectDetailsDialogProps) {
  const queryKey = useMemo(() => {
    if (!projectId || !workspaceId) return null;
    return ["/api/workspaces", workspaceId, "projects", projectId];
  }, [projectId, workspaceId]);

  const { data, isLoading, error } = useQuery<ProjectDetailResponse>({
    queryKey: queryKey ?? ["disabled"],
    enabled: open && !!projectId && !!workspaceId,
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/projects/${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Project Details</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load project details.</p>
        ) : data ? (
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-xl font-semibold">{data.project.name}</h3>
                  {data.project.description ? (
                    <p className="text-sm text-muted-foreground">{data.project.description}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={data.project.status} />
                  <TrackerBadge type={data.project.tracker.type} label={data.project.tracker.label} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Items" value={data.project.itemCount} />
                <Metric label="Team" value={data.project.memberCount} />
                <Metric
                  label="Last Updated"
                  value={data.project.lastUpdated ? formatDistanceToNow(new Date(data.project.lastUpdated), { addSuffix: true }) : "—"}
                />
                <Metric
                  label="Dependencies"
                  value={
                    data.project.dependencies.integrations +
                    data.project.dependencies.templates +
                    data.project.dependencies.contexts +
                    data.project.dependencies.runs
                  }
                />
              </div>

              <section>
                <h4 className="text-sm font-semibold text-foreground">Team</h4>
                <div className="mt-2">
                  {data.project.teamMembers && data.project.teamMembers.length > 0 ? (
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {data.project.teamMembers.map((m) => {
                        const name = m.user
                          ? (m.user.firstName || m.user.lastName)
                            ? `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim()
                            : m.user.email ?? m.user.id
                          : m.userId;
                        return (
                          <li key={m.userId} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                              {name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="truncate" title={name}>{name}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No team members assigned.</p>
                  )}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-semibold text-foreground">Integrations</h4>
                <div className="mt-2 space-y-2">
                  {data.project.integrations.length ? (
                    data.project.integrations.map((integration) => (
                      <div
                        key={integration.id}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <div className="font-medium capitalize">{integration.type.replace('_', ' ')}</div>
                        <div className="text-muted-foreground">
                          {integration.createdAt
                            ? formatDistanceToNow(new Date(integration.createdAt), { addSuffix: true })
                            : "—"}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No integrations connected.</p>
                  )}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-semibold text-foreground">Recent Activity</h4>
                <div className="mt-2">
                  <AuditTimeline entries={data.audit} />
                </div>
              </section>
            </div>
          </ScrollArea>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
