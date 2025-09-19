import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

export type ProjectStatusFilter = "all" | "active" | "planning" | "review" | "archived";
export type TrackerFilter = "all" | "jira" | "azure_devops" | "none";
export type HasIntegrationsFilter = "all" | "with" | "without";

export interface ProjectFilterState {
  search: string;
  status: ProjectStatusFilter;
  tracker: TrackerFilter;
  page: number;
  updatedAfter: string | null;
  ownerId: string | null;
  hasIntegrations: HasIntegrationsFilter;
}

const DEFAULT_FILTERS: ProjectFilterState = {
  search: "",
  status: "all",
  tracker: "all",
  page: 1,
  updatedAfter: null,
  ownerId: null,
  hasIntegrations: "all",
};

function parseFiltersFromLocation(location: string | null): ProjectFilterState {
  if (!location || !location.startsWith("/projects")) {
    return DEFAULT_FILTERS;
  }

  const [, queryString] = location.split("?");
  const params = new URLSearchParams(queryString ?? "");

  const status = params.get("status") as ProjectStatusFilter | null;
  const tracker = params.get("tracker") as TrackerFilter | null;
  const pageValue = parseInt(params.get("page") || "1", 10);
  const hasIntegrationsRaw = params.get("hasIntegrations");

  let hasIntegrations: HasIntegrationsFilter = "all";
  if (hasIntegrationsRaw === "true") hasIntegrations = "with";
  if (hasIntegrationsRaw === "false") hasIntegrations = "without";

  return {
    search: params.get("q") ?? "",
    status: status && ["all", "active", "planning", "review", "archived"].includes(status)
      ? status
      : "all",
    tracker: tracker && ["all", "jira", "azure_devops", "none"].includes(tracker)
      ? tracker
      : "all",
    page: Number.isNaN(pageValue) || pageValue < 1 ? 1 : pageValue,
    updatedAfter: params.get("updatedAfter"),
    ownerId: params.get("owner"),
    hasIntegrations,
  };
}

function filtersEqual(a: ProjectFilterState, b: ProjectFilterState) {
  return (
    a.search === b.search &&
    a.status === b.status &&
    a.tracker === b.tracker &&
    a.page === b.page &&
    a.updatedAfter === b.updatedAfter &&
    a.ownerId === b.ownerId &&
    a.hasIntegrations === b.hasIntegrations
  );
}

export function useProjectFilters() {
  const [location] = useLocation();
  const [filters, setFilters] = useState<ProjectFilterState>(() => parseFiltersFromLocation(location ?? null));

  useEffect(() => {
    const next = parseFiltersFromLocation(location ?? null);
    setFilters((current) => (filtersEqual(current, next) ? current : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const updateFilters = useCallback(
    (updates: Partial<ProjectFilterState>, options: { resetPage?: boolean } = { resetPage: true }) => {
      setFilters((current) => {
        const next: ProjectFilterState = {
          ...current,
          ...updates,
        };

        const shouldReset = options.resetPage ?? true;
        if (shouldReset) {
          const keys = Object.keys(updates) as Array<keyof ProjectFilterState>;
          if (keys.some((key) => key !== "page")) {
            next.page = 1;
          }
        }

        if (next.page < 1) next.page = 1;
        return next;
      });
    },
    [],
  );

  const setPage = useCallback((page: number) => {
    setFilters((current) => ({ ...current, page: page < 1 ? 1 : page }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!location || !location.startsWith("/projects")) return;

    const params = new URLSearchParams();
    if (filters.search) params.set("q", filters.search);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.tracker !== "all") params.set("tracker", filters.tracker);
    if (filters.page > 1) params.set("page", String(filters.page));
    if (filters.updatedAfter) params.set("updatedAfter", filters.updatedAfter);
    if (filters.ownerId) params.set("owner", filters.ownerId);
    if (filters.hasIntegrations === "with") params.set("hasIntegrations", "true");
    if (filters.hasIntegrations === "without") params.set("hasIntegrations", "false");

    const query = params.toString();
    const url = new URL(window.location.href);
    const nextUrl = `${url.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [filters, location]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("q", filters.search);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.tracker !== "all") params.set("tracker", filters.tracker);
    if (filters.page > 1) params.set("page", String(filters.page));
    if (filters.updatedAfter) params.set("updatedAfter", filters.updatedAfter);
    if (filters.ownerId) params.set("owner", filters.ownerId);
    if (filters.hasIntegrations === "with") params.set("hasIntegrations", "true");
    if (filters.hasIntegrations === "without") params.set("hasIntegrations", "false");
    return params;
  }, [filters]);

  return {
    filters,
    updateFilters,
    setPage,
    resetFilters,
    queryParams,
  };
}
