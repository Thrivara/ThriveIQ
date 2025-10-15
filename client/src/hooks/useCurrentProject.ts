import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspaceContext } from '@/context/workspace-context';

type Project = { id: string; name: string; workspaceId?: string; workspace_id?: string };

interface ProjectsResponse {
  items: Project[];
}

export function useCurrentProject() {
  const {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    projectSelections,
    isLoading: workspaceLoading,
    setActiveProject,
  } = useWorkspaceContext();

  const selectionState = activeWorkspaceId ? projectSelections[activeWorkspaceId] : undefined;

  const projectsQ = useQuery<ProjectsResponse>({
    queryKey: activeWorkspaceId ? ['/api/workspaces', activeWorkspaceId, 'projects', 'summary'] : ['disabled'],
    enabled: !!activeWorkspaceId,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/projects?limit=50`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const projects = projectsQ.data?.items ?? [];

  const selectedProjectId = useMemo(() => {
    if (selectionState === undefined) return undefined;
    if (selectionState) return selectionState;
    return projects[0]?.id ?? null;
  }, [selectionState, projects]);

  const project = useMemo(() => {
    if (!selectedProjectId) return undefined;
    return projects.find((p) => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    const list = projects;
    if (selectionState === undefined) return;
    if (!list.length) return;

    if (selectionState === null) {
      const fallback = list[0]?.id ?? null;
      if (fallback) {
        setActiveProject(activeWorkspaceId, fallback);
      }
      return;
    }

    if (list.some((p) => p.id === selectionState)) {
      return;
    }

    const fallback = list[0]?.id ?? null;
    setActiveProject(activeWorkspaceId, fallback);
  }, [
    projects,
    activeWorkspaceId,
    selectionState,
    setActiveProject,
  ]);

  const projectId = selectedProjectId ?? undefined;

  const selectProject = (id: string) => {
    if (!activeWorkspaceId) return;
    setActiveProject(activeWorkspaceId, id);
  };

  return {
    isLoading: workspaceLoading || projectsQ.isLoading,
    workspaces,
    projects,
    projectId,
    project,
    workspaceId: activeWorkspaceId ?? null,
    workspace: activeWorkspace ?? null,
    selectProject,
  };
}
