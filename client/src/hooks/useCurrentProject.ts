import { useQuery } from '@tanstack/react-query';

type Workspace = { id: string; name: string };
type Project = { id: string; name: string; workspaceId?: string; workspace_id?: string };

interface ProjectsResponse {
  items: Project[];
}

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

  const project = projectsQ.data?.items?.[0];
  const projectId = project?.id;

  return {
    isLoading: workspacesQ.isLoading || projectsQ.isLoading,
    workspaces: workspacesQ.data ?? [],
    projects: projectsQ.data?.items ?? [],
    projectId,
    workspaceId: firstWsId ?? null,
  };
}

