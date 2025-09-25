import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useProjectFilters, HasIntegrationsFilter, ProjectFilterState } from "@/hooks/useProjectFilters";
import { ProjectsToolbar } from "@/components/projects/projects-toolbar";
import { ProjectsTable, ProjectListItem } from "@/components/projects/projects-table";
import { ProjectEditorDialog, ProjectFormValues } from "@/components/projects/project-editor-dialog";
import { ConfirmDialog } from "@/components/projects/confirm-dialog";
import { ProjectsFiltersDialog } from "@/components/projects/projects-filters-dialog";
import { ProjectDetailsDialog } from "@/components/projects/project-details-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Card, CardContent } from "@/components/ui/card";

interface Workspace {
  id: string;
  name: string;
}

interface WorkspaceMemberResponse {
  members: Array<{
    userId: string;
    role: string;
    user: {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }>;
}

interface ProjectsListResponse {
  items: ProjectListItem[];
  page: number;
  limit: number;
  total: number;
}

const PAGE_SIZE = 20;

export default function Projects() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { filters, updateFilters, setPage, queryParams } = useProjectFilters();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [isEditorOpen, setEditorOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectListItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "archive" | "delete"; project: ProjectListItem } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [editingTeamUserIds, setEditingTeamUserIds] = useState<string[] | null>(null);

  useEffect(() => {
    setSearchValue(filters.search);
  }, [filters.search]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      updateFilters({ search: searchValue }, { resetPage: true });
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchValue, updateFilters]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Redirecting to login...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
  }, [authLoading, isAuthenticated, toast]);

  const workspacesQuery = useQuery<Workspace[]>({ queryKey: ["/api/workspaces"] });
  const workspaceId = workspacesQuery.data?.[0]?.id ?? null;
  const workspaceName = workspacesQuery.data?.[0]?.name ?? "";

  const membersQuery = useQuery<WorkspaceMemberResponse>({
    queryKey: workspaceId ? ["/api/workspaces", workspaceId, "members"] : ["disabled", "members"],
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const projectsQuery = useQuery<ProjectsListResponse>({
    queryKey: workspaceId ? ["/api/workspaces", workspaceId, "projects", queryParams.toString()] : ["disabled", "projects"],
    enabled: !!workspaceId && isAuthenticated,
    queryFn: async () => {
      const params = new URLSearchParams(queryParams);
      params.set("limit", String(PAGE_SIZE));
      const res = await fetch(`/api/workspaces/${workspaceId}/projects?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
  });

  const createProject = useMutation({
    mutationFn: async (values: ProjectFormValues & { teamUserIds?: string[] }) => {
      if (!workspaceId) throw new Error("Workspace required");
      const res = await fetch(`/api/workspaces/${workspaceId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json() as Promise<ProjectListItem>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "projects"] });
      setEditorOpen(false);
      setEditingProject(null);
      toast({ title: "Project created" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateProject = useMutation({
    mutationFn: async (values: ProjectFormValues & { id: string; teamUserIds?: string[] }) => {
      if (!workspaceId) throw new Error("Workspace required");
      const res = await fetch(`/api/workspaces/${workspaceId}/projects/${values.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "projects"] });
      setEditorOpen(false);
      setEditingProject(null);
      toast({ title: "Project updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const archiveProject = useMutation({
    mutationFn: async (project: ProjectListItem) => {
      if (!workspaceId) throw new Error("Workspace required");
      const res = await fetch(`/api/workspaces/${workspaceId}/projects/${project.id}/archive`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "projects"] });
      toast({ title: "Project archived" });
      setConfirmAction(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to archive project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (project: ProjectListItem) => {
      if (!workspaceId) throw new Error("Workspace required");
      const res = await fetch(`/api/workspaces/${workspaceId}/projects/${project.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "projects"] });
      toast({ title: "Project deleted" });
      setConfirmAction(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (values: ProjectFormValues & { teamUserIds?: string[] }) => {
    try {
      if (editingProject) {
        await updateProject.mutateAsync({ ...values, id: editingProject.id });
      } else {
        await createProject.mutateAsync(values);
      }
    } catch {
      // handled via mutation onError
    }
  };

  const totalPages = useMemo(() => {
    if (!projectsQuery.data) return 1;
    return Math.max(1, Math.ceil(projectsQuery.data.total / PAGE_SIZE));
  }, [projectsQuery.data]);

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const currentPage = filters.page;
    const pages: number[] = [];
    for (let page = 1; page <= totalPages; page += 1) {
      if (page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1) {
        pages.push(page);
      }
    }

    const uniquePages = Array.from(new Set(pages)).sort((a, b) => a - b);

    return (
      <Pagination className="mt-6">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (currentPage > 1) setPage(currentPage - 1);
              }}
            />
          </PaginationItem>
          {uniquePages.map((page) => (
            <PaginationItem key={page}>
              <PaginationLink
                href="#"
                isActive={page === currentPage}
                onClick={(event) => {
                  event.preventDefault();
                  setPage(page);
                }}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(event) => {
                event.preventDefault();
                if (currentPage < totalPages) setPage(currentPage + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading projects…</span>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Manage your projects and track progress across {workspaceName || "your workspace"}.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 md:p-6">
            <ProjectsToolbar
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              status={filters.status}
              onStatusChange={(value) => updateFilters({ status: value }, { resetPage: true })}
              tracker={filters.tracker}
              onTrackerChange={(value) => updateFilters({ tracker: value }, { resetPage: true })}
              onOpenAdvancedFilters={() => setFiltersOpen(true)}
              onNewProject={() => setEditorOpen(true)}
              isCreating={createProject.isPending || updateProject.isPending}
            />
          </CardContent>
        </Card>

        {projectsQuery.isError ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex h-40 items-center justify-center text-sm text-destructive">
                Failed to load projects.
              </div>
            </CardContent>
          </Card>
        ) : projectsQuery.isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading projects…
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <ProjectsTable
                projects={projectsQuery.data?.items ?? []}
                onViewDetails={(project) => setDetailProjectId(project.id)}
                onEdit={(project) => {
                  setEditingProject(project);
                  // fetch current team for editor prefill
                  if (workspaceId) {
                    fetch(`/api/workspaces/${workspaceId}/projects/${project.id}/members`, { credentials: "include" })
                      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
                      .then((data) => setEditingTeamUserIds((data.members ?? []).map((m: any) => m.userId)))
                      .catch(() => setEditingTeamUserIds([]));
                  }
                  setEditorOpen(true);
                }}
                onArchive={(project) => setConfirmAction({ type: "archive", project })}
                onDelete={(project) => setConfirmAction({ type: "delete", project })}
                archiveLoadingId={archiveProject.isPending ? confirmAction?.project.id ?? null : null}
                deleteLoadingId={deleteProject.isPending ? confirmAction?.project.id ?? null : null}
              />
            </CardContent>
          </Card>
        )}

        {renderPagination()}
      </div>

      <ProjectEditorDialog
        open={isEditorOpen}
        onOpenChange={(openState) => {
          setEditorOpen(openState);
          if (!openState) {
            setEditingProject(null);
            setEditingTeamUserIds(null);
          }
        }}
        project={editingProject}
        onSubmit={handleSubmit}
        members={membersQuery.data?.members ?? []}
        initialTeamUserIds={editingProject ? editingTeamUserIds ?? [] : []}
        isSubmitting={createProject.isPending || updateProject.isPending}
      />

      <ProjectsFiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={{
          updatedAfter: filters.updatedAfter,
          ownerId: filters.ownerId,
          hasIntegrations: filters.hasIntegrations as HasIntegrationsFilter,
        }}
        members={membersQuery.data?.members ?? []}
        onApply={(values) => {
          const updates: Partial<ProjectFilterState> = {
            updatedAfter: values.updatedAfter,
            ownerId: values.ownerId,
            hasIntegrations: values.hasIntegrations,
          };
          updateFilters(updates, { resetPage: true });
        }}
        onReset={() => {
          const updates: Partial<ProjectFilterState> = {
            updatedAfter: null,
            ownerId: null,
            hasIntegrations: "all",
          };
          updateFilters(updates, { resetPage: true });
        }}
      />

      <ProjectDetailsDialog
        open={!!detailProjectId}
        onOpenChange={(openState) => {
          if (!openState) setDetailProjectId(null);
        }}
        projectId={detailProjectId}
        workspaceId={workspaceId}
      />

      <ConfirmDialog
        open={!!confirmAction && confirmAction.type === "archive"}
        onOpenChange={(openState) => {
          if (!openState) setConfirmAction(null);
        }}
        title="Archive project"
        description="Archived projects cannot be used for new work items until restored."
        confirmLabel={archiveProject.isPending ? "Archiving…" : "Archive"}
        onConfirm={() => {
          if (confirmAction) archiveProject.mutate(confirmAction.project);
        }}
        isLoading={archiveProject.isPending}
      />

      <ConfirmDialog
        open={!!confirmAction && confirmAction.type === "delete"}
        onOpenChange={(openState) => {
          if (!openState) setConfirmAction(null);
        }}
        title="Delete project"
        description="Deleting a project is permanent. Consider archiving instead if you need to keep history."
        confirmLabel={deleteProject.isPending ? "Deleting…" : "Delete"}
        onConfirm={() => {
          if (confirmAction) deleteProject.mutate(confirmAction.project);
        }}
        isLoading={deleteProject.isPending}
      />
    </main>
  );
}
