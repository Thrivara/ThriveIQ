import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

type Workspace = { id: string; name: string };
type Project = { id: string; name: string; workspaceId?: string; workspace_id?: string };

interface ProjectsResponse {
  items: Project[];
}

const STORAGE_KEY = 'thrivemq.currentProjectId';

export function useCurrentProject() {
  const workspacesQ = useQuery<Workspace[]>({ queryKey: ['/api/workspaces'], retry: false });

  const firstWsId = workspacesQ.data?.[0]?.id;

  const projectsQ = useQuery<ProjectsResponse>({
    queryKey: firstWsId ? ['/api/workspaces', firstWsId, 'projects', 'summary'] : ['disabled'],
    enabled: !!firstWsId,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${firstWsId}/projects?limit=50`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  // Selected project state sourced from localStorage, with sensible defaults
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Initialize from storage when mounted
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelectedId(stored);
  }, []);

  // Resolve actual current project from projects list + stored/defaults
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
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  };

  return {
    isLoading: workspacesQ.isLoading || projectsQ.isLoading,
    workspaces: workspacesQ.data ?? [],
    projects: projectsQ.data?.items ?? [],
    projectId,
    project,
    workspaceId: firstWsId ?? null,
    selectProject,
  };
}
