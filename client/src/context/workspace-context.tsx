import { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  isLoading: boolean;
  setActiveWorkspace: (workspaceId: string) => void;
  refetch: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const STORAGE_KEY = "thrivemq.activeWorkspaceId";

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setActiveWorkspaceId(stored);
    }
  }, []);

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

  const activeWorkspace = useMemo(() => {
    if (!activeWorkspaceId) return null;
    return workspaces.find((ws) => ws.id === activeWorkspaceId) ?? null;
  }, [activeWorkspaceId, workspaces]);

  const setActiveWorkspace = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, workspaceId);
    }
  };

  const refetch = async () => {
    await workspaceQuery.refetch();
  };

  const value: WorkspaceContextValue = {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    isLoading: workspaceQuery.isLoading,
    setActiveWorkspace,
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
