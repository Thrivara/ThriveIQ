import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspaceContext } from '@/context/workspace-context';

type Project = { id: string; name: string; workspaceId?: string; workspace_id?: string };

interface ProjectsResponse {
  items: Project[];
}

const STORAGE_KEY = 'thrivemq.currentProjectId';

function getStorageKeyForWorkspace(workspaceId: string) {
  return `${STORAGE_KEY}:${workspaceId}`;
}

export function useCurrentProject() {
  const { workspaces, activeWorkspaceId, activeWorkspace, isLoading: workspaceLoading } = useWorkspaceContext();

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

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setSelectedId(null);
      return;
    }
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(getStorageKeyForWorkspace(activeWorkspaceId));
    if (stored) {
      setSelectedId(stored);
    } else {
      setSelectedId(null);
    }
  }, [activeWorkspaceId]);

  const project = useMemo(() => {
    const list = projectsQ.data?.items ?? [];
    if (!list.length) return undefined;

    // 1) Stored selection
    if (selectedId) {
      const match = list.find((p) => p.id === selectedId);
      if (match) return match;
    }

    // 2) Prefer seeded MHEG if present
    const mheg = list.find((p) => (p.name || '').toLowerCase() === 'mheg');
    if (mheg) return mheg;

    // 3) Fallback to first project
    return list[0];
  }, [projectsQ.data?.items, selectedId]);

  const projectId = project?.id;

  const selectProject = (id: string) => {
    setSelectedId(id);
    if (typeof window !== 'undefined' && activeWorkspaceId) {
      window.localStorage.setItem(getStorageKeyForWorkspace(activeWorkspaceId), id);
    }
  };

  useEffect(() => {
    if (!project || !activeWorkspaceId) return;
    if (project.id === selectedId) return;
    setSelectedId(project.id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(getStorageKeyForWorkspace(activeWorkspaceId), project.id);
    }
  }, [project, activeWorkspaceId, selectedId]);

  return {
    isLoading: workspaceLoading || projectsQ.isLoading,
    workspaces,
    projects: projectsQ.data?.items ?? [],
    projectId,
    project,
    workspaceId: activeWorkspaceId ?? null,
    workspace: activeWorkspace ?? null,
    selectProject,
  };
}
