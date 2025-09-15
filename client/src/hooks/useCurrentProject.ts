import { useQuery } from '@tanstack/react-query';

type Workspace = { id: string; name: string };
type Project = { id: string; name: string; workspaceId?: string; workspace_id?: string };

export function useCurrentProject() {
  const workspacesQ = useQuery<Workspace[]>({ queryKey: ['/api/workspaces'], retry: false });

  const firstWsId = workspacesQ.data?.[0]?.id;

  const projectsQ = useQuery<Project[]>({
    queryKey: firstWsId ? ['/api/workspaces', firstWsId, 'projects'] : ['disabled'],
    enabled: !!firstWsId,
    retry: false,
  });

  const project = projectsQ.data?.[0];
  const projectId = project?.id;

  return {
    isLoading: workspacesQ.isLoading || projectsQ.isLoading,
    workspaces: workspacesQ.data ?? [],
    projects: projectsQ.data ?? [],
    projectId,
  };
}

