import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export type WorkspaceRole = "owner" | "admin" | "contributor" | "viewer";

export interface WorkspaceSummary {
  id: string;
  name: string;
  description?: string | null;
  role: WorkspaceRole;
}

interface WorkspaceContextValue {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceSummary | null;
  activeProjectId: string | null;
  projectSelections: Record<string, string | null>;
  isLoading: boolean;
  setActiveWorkspace: (workspaceId: string) => void;
  setActiveProject: (workspaceId: string, projectId: string | null) => void;
  refetch: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const STORAGE_KEY = "thrivemq.activeWorkspaceId";
const CURRENT_PROJECT_KEY = "thrivemq.currentProjectId";
const PROJECT_SELECTIONS_KEY = "thrivemq.projectSelections";
const LEGACY_PROJECT_PREFIX = "thrivemq.currentProjectId:";

async function fetchWorkspaces(): Promise<WorkspaceSummary[]> {
  const res = await fetch("/api/workspaces", { credentials: "include" });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const workspaceQuery = useQuery({
    queryKey: ["/api/workspaces"],
    queryFn: fetchWorkspaces,
  });

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [projectSelections, setProjectSelections] = useState<Record<string, string | null>>({});

  const persistProjectSelections = useCallback((selections: Record<string, string | null>) => {
    if (typeof window === "undefined") return;
    try {
      const payload = JSON.stringify(selections);
      window.localStorage.setItem(PROJECT_SELECTIONS_KEY, payload);
    } catch (error) {
      console.error("[workspace] persist project selections error", error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setActiveWorkspaceId(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const selections: Record<string, string | null> = {};

    const storedSelections = window.localStorage.getItem(PROJECT_SELECTIONS_KEY);
    if (storedSelections) {
      try {
        const parsed = JSON.parse(storedSelections);
        if (parsed && typeof parsed === "object") {
          for (const [workspaceId, projectId] of Object.entries(parsed as Record<string, unknown>)) {
            selections[workspaceId] = typeof projectId === "string" ? projectId : null;
          }
        }
      } catch (error) {
        console.error("[workspace] parse project selections error", error);
      }
    }

    const legacyKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(LEGACY_PROJECT_PREFIX)) {
        legacyKeys.push(key);
      }
    }

    if (legacyKeys.length) {
      for (const key of legacyKeys) {
        const workspaceId = key.slice(LEGACY_PROJECT_PREFIX.length);
        const value = window.localStorage.getItem(key);
        selections[workspaceId] = value ?? null;
        window.localStorage.removeItem(key);
      }
      persistProjectSelections(selections);
    }

    setProjectSelections(selections);
  }, [persistProjectSelections]);

  const workspaces = workspaceQuery.data ?? [];

  useEffect(() => {
    if (!workspaces.length) return;
    if (activeWorkspaceId && workspaces.some((ws) => ws.id === activeWorkspaceId)) {
      return;
    }
    const fallbackId = workspaces[0]?.id ?? null;
    if (fallbackId) {
      setActiveWorkspaceId(fallbackId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, fallbackId);
      }
    }
  }, [workspaces, activeWorkspaceId]);

  useEffect(() => {
    if (!workspaces.length) return;
    setProjectSelections((current) => {
      let changed = false;
      const next = { ...current };
      for (const ws of workspaces) {
        if (next[ws.id] === undefined) {
          next[ws.id] = null;
          changed = true;
        }
      }
      if (changed) {
        persistProjectSelections(next);
        return next;
      }
      return current;
    });
  }, [workspaces, persistProjectSelections]);

  const activeWorkspace = useMemo(() => {
    if (!activeWorkspaceId) return null;
    return workspaces.find((ws) => ws.id === activeWorkspaceId) ?? null;
  }, [activeWorkspaceId, workspaces]);

  const activeProjectId = activeWorkspaceId ? projectSelections[activeWorkspaceId] ?? null : null;

  const setActiveWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, workspaceId);
    }
  }, []);

  const setActiveProject = useCallback(
    (workspaceId: string, projectId: string | null) => {
      setProjectSelections((current) => {
        const existing = current[workspaceId] ?? null;
        if (existing === projectId) return current;
        const next = { ...current, [workspaceId]: projectId };
        persistProjectSelections(next);
        return next;
      });
    },
    [persistProjectSelections],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeWorkspaceId) {
      window.localStorage.removeItem(CURRENT_PROJECT_KEY);
      return;
    }

    const currentProject = projectSelections[activeWorkspaceId];
    if (currentProject) {
      window.localStorage.setItem(CURRENT_PROJECT_KEY, currentProject);
    } else {
      window.localStorage.removeItem(CURRENT_PROJECT_KEY);
    }
  }, [activeWorkspaceId, projectSelections]);

  const refetch = async () => {
    await workspaceQuery.refetch();
  };

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    activeProjectId,
    projectSelections,
    isLoading: workspaceQuery.isLoading,
    setActiveWorkspace,
    setActiveProject,
    refetch,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspaceContext must be used within a WorkspaceProvider");
  }
  return ctx;
}
