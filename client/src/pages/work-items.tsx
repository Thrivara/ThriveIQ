import { useState, useMemo, useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useCurrentProject } from "@/hooks/useCurrentProject";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { ClipboardList, ExternalLink, Sparkles, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface ApplyOptions {
  selectedFields: string[];
  createTasks: boolean;
  createTestCases: boolean;
  setStoryPoints: boolean;
}

interface ApplyResult {
  itemId: string;
  success: boolean;
  error?: string;
}

interface ApplyResponse {
  results: ApplyResult[];
}

interface ProjectContext {
  id: string;
  fileName?: string | null;
  status?: string | null;
}

interface RunItem {
  id: string;
  source_item_id: string;
  [key: string]: unknown;
}

interface WorkItemSummary {
  id: number;
  title?: string;
  state?: string;
  type?: string;
  assignedTo?: string | null;
  changedDate?: string | null;
  iterationPath?: string | null;
  areaPath?: string | null;
  tags?: string[];
  descriptionPreview?: string;
  source: string;
  links: { html: string };
}

interface WorkItemFilters {
  types: string[];
  states: string[];
  assignedTo: string[];
  iterations: string[];
  areas: string[];
  tags: string[];
}

interface WorkItemsResponse {
  items: WorkItemSummary[];
  total: number;
  page: number;
  pageSize: number;
  filters?: WorkItemFilters;
}

export default function WorkItems() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const { projectId, isLoading: loadingProject } = useCurrentProject();

  // Always call hooks in the same order; use `enabled` to guard queries
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<'ChangedDate'|'Title'|'State'|'Type'>("ChangedDate");
  const [sortDir, setSortDir] = useState<'ASC'|'DESC'>("DESC");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [detailId, setDetailId] = useState<number|null>(null);
  const [showCols, setShowCols] = useState({ id: true, title: true, type: true, state: true, assigned: true, sprint: true, area: false, tags: false, changed: false, link: true });
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [filterAssigned, setFilterAssigned] = useState<string[]>([]);
  const [filterIterations, setFilterIterations] = useState<string[]>([]);
  const [filterAreas, setFilterAreas] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);

  const toggleFilterValue = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setPage(1);
    setter((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    );
  };

  const clearFilterValues = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setPage(1);
    setter([]);
  };

  const clearAllFilters = () => {
    setPage(1);
    setFilterTypes([]);
    setFilterStates([]);
    setFilterAssigned([]);
    setFilterIterations([]);
    setFilterAreas([]);
    setFilterTags([]);
  };

  const queryKey = useMemo(
    () =>
      projectId
        ? [
            "/api/projects",
            projectId,
            "work-items",
            {
              q,
              page,
              pageSize,
              sortBy,
              sortDir,
              filterTypes,
              filterStates,
              filterAssigned,
              filterIterations,
              filterAreas,
              filterTags,
            },
          ]
        : ["disabled"],
    [
      projectId,
      q,
      page,
      pageSize,
      sortBy,
      sortDir,
      filterTypes,
      filterStates,
      filterAssigned,
      filterIterations,
      filterAreas,
      filterTags,
    ],
  );
  const { data, isLoading: itemsLoading, error, refetch } = useQuery<WorkItemsResponse>({
    queryKey,
    enabled: !!projectId && isAuthenticated && !isLoading && !loadingProject,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy, sortDir });
      if (q) params.set('q', q);
      filterTypes.forEach(t=> params.append('type', t));
      filterStates.forEach(s=> params.append('state', s));
      filterAssigned.forEach(a=> params.append('assignedTo', a));
      filterIterations.forEach(i=> params.append('iteration', i));
      filterAreas.forEach(ap=> params.append('area', ap));
      filterTags.forEach(t=> params.append('tag', t));
      const res = await fetch(`/api/projects/${projectId}/work-items?`+params.toString());
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  const currentItems: WorkItemSummary[] = data?.items ?? [];

  const fallbackFilters = useMemo<WorkItemFilters>(() => {
    const types = uniqueSorted(currentItems.map((item) => item.type ?? null));
    const states = uniqueSorted(currentItems.map((item) => item.state ?? null));
    const assigned = uniqueSorted(currentItems.map((item) => item.assignedTo ?? 'Unassigned'));
    if (!assigned.includes('Unassigned')) {
      assigned.push('Unassigned');
      assigned.sort((a, b) => a.localeCompare(b));
    }
    const iterations = uniqueSorted(currentItems.map((item) => item.iterationPath ?? null));
    const areas = uniqueSorted(currentItems.map((item) => item.areaPath ?? null));
    const tagSet = new Set<string>();
    currentItems.forEach((item) => {
      (item.tags ?? []).forEach((tag) => {
        if (tag) tagSet.add(tag);
      });
    });
    const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));

    return { types, states, assignedTo: assigned, iterations, areas, tags };
  }, [currentItems]);

  const baseFilters = data?.filters;

  const typeOptions = useMemo(
    () => buildFilterOptions(baseFilters?.types, filterTypes, fallbackFilters.types),
    [baseFilters?.types, filterTypes, fallbackFilters.types],
  );
  const stateOptions = useMemo(
    () => buildFilterOptions(baseFilters?.states, filterStates, fallbackFilters.states),
    [baseFilters?.states, filterStates, fallbackFilters.states],
  );
  const assignedOptions = useMemo(
    () => buildFilterOptions(baseFilters?.assignedTo, filterAssigned, fallbackFilters.assignedTo, true),
    [baseFilters?.assignedTo, filterAssigned, fallbackFilters.assignedTo],
  );
  const iterationOptions = useMemo(
    () => buildFilterOptions(baseFilters?.iterations, filterIterations, fallbackFilters.iterations),
    [baseFilters?.iterations, filterIterations, fallbackFilters.iterations],
  );
  const areaOptions = useMemo(
    () => buildFilterOptions(baseFilters?.areas, filterAreas, fallbackFilters.areas),
    [baseFilters?.areas, filterAreas, fallbackFilters.areas],
  );
  const tagOptions = useMemo(
    () => buildFilterOptions(baseFilters?.tags, filterTags, fallbackFilters.tags),
    [baseFilters?.tags, filterTags, fallbackFilters.tags],
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading || loadingProject || !isAuthenticated || !projectId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-foreground">Loading work items...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6" data-testid="work-items-main">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Work Items</h1>
          <p className="text-muted-foreground">Browse and manage work items from your connected integrations</p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Filter by keyword"
            value={searchInput}
            onChange={(e)=> setSearchInput(e.target.value)}
            onKeyDown={(e)=> {
              if (e.key === 'Enter') {
                setQ(searchInput.trim());
                setPage(1);
                refetch();
              }
            }}
            className="max-w-sm"
          />
          <Button
            onClick={()=>{
              setQ(searchInput.trim());
              setPage(1);
              refetch();
            }}
          >
            Search
          </Button>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span>Sort</span>
            <select value={sortBy} onChange={(e)=> setSortBy(e.target.value as any)} className="border rounded px-2 py-1">
              <option value="ChangedDate">Changed</option>
              <option value="Title">Title</option>
              <option value="State">State</option>
              <option value="Type">Type</option>
            </select>
            <select value={sortDir} onChange={(e)=> setSortDir(e.target.value as any)} className="border rounded px-2 py-1">
              <option value="DESC">Desc</option>
              <option value="ASC">Asc</option>
            </select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-700">Columns</Button>
              </PopoverTrigger>
              <PopoverContent className="w-56">
                {[
                  { key: 'id', label: 'ID' },
                  { key: 'title', label: 'Title' },
                  { key: 'type', label: 'Type' },
                  { key: 'state', label: 'State' },
                  { key: 'assigned', label: 'Assigned' },
                  { key: 'sprint', label: 'Sprint' },
                  { key: 'area', label: 'Area Path' },
                  { key: 'tags', label: 'Tags' },
                  { key: 'changed', label: 'Changed' },
                  { key: 'link', label: 'Link' },
                ].map(({ key, label })=> (
                  <div key={key} className="flex items-center justify-between py-1 text-sm">
                    <Label htmlFor={`col-${key}`}>{label}</Label>
                    <Switch id={`col-${key}`} checked={(showCols as any)[key]} onCheckedChange={(v)=> setShowCols({ ...showCols, [key]: v } as any)} />
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FilterMultiSelect
            label="Types"
            options={typeOptions}
            selected={filterTypes}
            onToggle={(value) => toggleFilterValue(value, setFilterTypes)}
            onClear={() => clearFilterValues(setFilterTypes)}
            renderOption={(option, _checked) => (
              <Badge variant="secondary" className={`text-xs ${typeBadgeClass(option)}`}>
                {option}
              </Badge>
            )}
          />
          <FilterMultiSelect
            label="States"
            options={stateOptions}
            selected={filterStates}
            onToggle={(value) => toggleFilterValue(value, setFilterStates)}
            onClear={() => clearFilterValues(setFilterStates)}
            renderOption={(option, _checked) => (
              <Badge variant="secondary" className="text-xs">
                {option}
              </Badge>
            )}
          />
          <FilterMultiSelect
            label="Assigned"
            options={assignedOptions}
            selected={filterAssigned}
            onToggle={(value) => toggleFilterValue(value, setFilterAssigned)}
            onClear={() => clearFilterValues(setFilterAssigned)}
            renderOption={(option, _checked) => (
              <Badge variant="secondary" className="text-xs">
                {option}
              </Badge>
            )}
          />
          <FilterMultiSelect
            label="Sprint"
            options={iterationOptions}
            selected={filterIterations}
            onToggle={(value) => toggleFilterValue(value, setFilterIterations)}
            onClear={() => clearFilterValues(setFilterIterations)}
            renderOption={(option, _checked) => (
              <Badge variant="secondary" className="text-xs">
                {option}
              </Badge>
            )}
          />
          <FilterMultiSelect
            label="Area"
            options={areaOptions}
            selected={filterAreas}
            onToggle={(value) => toggleFilterValue(value, setFilterAreas)}
            onClear={() => clearFilterValues(setFilterAreas)}
            renderOption={(option, _checked) => (
              <span className="text-xs font-medium truncate max-w-[200px]">{option}</span>
            )}
          />
          <FilterMultiSelect
            label="Tags"
            options={tagOptions}
            selected={filterTags}
            onToggle={(value) => toggleFilterValue(value, setFilterTags)}
            onClear={() => clearFilterValues(setFilterTags)}
            renderOption={(option, _checked) => (
              <Badge variant="outline" className="text-xs">
                {option}
              </Badge>
            )}
          />
          <Button variant="ghost" onClick={clearAllFilters}>
            Clear Filters
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <ClipboardList className="w-5 h-5" />
              <span>Work Items Browser</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {itemsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2">Loading work items...</span>
              </div>
            ) : error ? (
              <div className="text-sm text-red-600">{(error as any).message || 'Failed to load work items'}</div>
            ) : (data?.items?.length ?? 0) === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">No work items found</p>
                <p className="text-muted-foreground">Connect Azure DevOps and try again.</p>
              </div>
            ) : (
              <div className="relative">
                <div className="max-h-[60vh] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="text-left border-b sticky top-0 bg-background z-10">
                    <tr>
                      <th className="py-2 px-2"><input type="checkbox" aria-label="select all" onChange={(e)=>{
                        const next: Record<number, boolean> = {};
                        if (e.target.checked) data!.items.forEach((w:any)=> next[w.id]=true);
                        setSelected(next);
                      }} /></th>
                      {showCols.id && <th className="py-2 px-2">ID</th>}
                      {showCols.title && <th className="py-2 px-2">Title</th>}
                      {showCols.type && <th className="py-2 px-2">Type</th>}
                      {showCols.state && <th className="py-2 px-2">State</th>}
                      {showCols.assigned && <th className="py-2 px-2">Assigned</th>}
                      {showCols.sprint && <th className="py-2 px-2">Sprint</th>}
                      {showCols.area && <th className="py-2 px-2">Area Path</th>}
                      {showCols.tags && <th className="py-2 px-2">Tags</th>}
                      {showCols.changed && <th className="py-2 px-2">Changed</th>}
                      {showCols.link && <th className="py-2 px-2">Link</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data!.items.map((w:any)=> (
                      <tr key={w.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={()=> setDetailId(w.id)}>
                        <td className="py-2 px-2" onClick={(e)=> e.stopPropagation()}>
                          <input type="checkbox" checked={!!selected[w.id]} onChange={(e)=> setSelected({ ...selected, [w.id]: e.target.checked })} />
                        </td>
                        {showCols.id && <td className="py-2 px-2">{w.id}</td>}
                        {showCols.title && <td className="py-2 px-2">
                          <div className="font-medium truncate max-w-[520px]" title={w.title}>{w.title}</div>
                          {w.descriptionPreview && <div className="text-xs text-muted-foreground truncate max-w-[520px]">{w.descriptionPreview}</div>}
                        </td>}
                        {showCols.type && <td className="py-2 px-2">
                          <Badge variant="secondary" className={typeBadgeClass(w.type)}>{w.type}</Badge>
                        </td>}
                        {showCols.state && <td className="py-2 px-2">
                          <Badge variant={w.state === 'New' ? 'secondary' : 'default'} className={w.state==='New'? '' : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'}>{w.state}</Badge>
                        </td>}
                        {showCols.assigned && <td className="py-2 px-2">{w.assignedTo ?? 'Unassigned'}</td>}
                        {showCols.sprint && <td className="py-2 px-2">{w.iterationPath ?? ''}</td>}
                        {showCols.area && <td className="py-2 px-2">{w.areaPath ?? ''}</td>}
                        {showCols.tags && (
                          <td className="py-2 px-2">
                            <div className="flex flex-wrap gap-1">
                              {(w.tags || []).map((tag: string) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </td>
                        )}
                        {showCols.changed && <td className="py-2 px-2">{w.changedDate ? new Date(w.changedDate).toLocaleString() : ''}</td>}
                        {showCols.link && <td className="py-2 px-2" onClick={(e)=> e.stopPropagation()}>
                          <a href={w.links?.html} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1"><ExternalLink className="w-4 h-4" />Open</a>
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <div className="flex items-center justify-between text-sm mt-3">
                  <div className="flex items-center gap-2">
                    <span>Page {page} · Showing {data!.items.length} of {data!.total} • Page size</span>
                    <select value={pageSize} onChange={(e)=> { setPageSize(parseInt(e.target.value,10)); setPage(1); refetch(); }} className="border rounded px-2 py-1">
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={page<=1} onClick={()=> { setPage(p=> p-1); refetch(); }}>Prev</Button>
                    <Button variant="outline" disabled={(page*pageSize) >= (data!.total||0)} onClick={()=> { setPage(p=> p+1); refetch(); }}>Next</Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Dialog open={detailId!=null} onOpenChange={(o)=> !o && setDetailId(null)}>
          <DialogContent
            className="sm:max-w-[900px] max-h-[80vh] overflow-y-auto"
            onInteractOutside={(e)=> e.preventDefault()}
            onEscapeKeyDown={(e)=> e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Work Item #{detailId}</DialogTitle>
            </DialogHeader>
            {detailId!=null && <WorkItemDetails projectId={projectId!} id={detailId} />}
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}

function WorkItemDetails({ projectId, id }: { projectId: string; id: number }) {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ['/api/projects', projectId, 'work-items', 'ado', id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/work-items/ado/${id}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });
  const templatesQ = useQuery<{ id: string; name: string; version: number }[]>({
    queryKey: ['/api/projects', projectId, 'templates', 'published'],
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/templates?view=published&limit=100`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const items: any[] = json?.items ?? [];
      // Only include published versions in the modal
      return items
        .filter(item => item.publishedVersion?.version != null)
        .map(item => ({ id: item.id, name: item.name, version: item.publishedVersion.version }));
    }
  });
  const contextsQ = useQuery<ProjectContext[]>({
    queryKey: ['/api/projects', projectId, 'contexts'],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/contexts`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  const [templateId, setTemplateId] = useState<string>('');
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [tab, setTab] = useState<'details'|'generate'|'results'>('details');
  const [debugJson, setDebugJson] = useState<boolean>(false);
  // Persist debug toggle per session
  useEffect(() => {
    const saved = localStorage.getItem('thriveiq.debugJson');
    if (saved != null) setDebugJson(saved === '1');
  }, []);
  useEffect(() => {
    localStorage.setItem('thriveiq.debugJson', debugJson ? '1' : '0');
  }, [debugJson]);

  const availableContexts = (contextsQ.data ?? []).filter((context) => context.status !== 'deleted');
  const { toast: pushToast } = useToast();
  const workItemLink = typeof data?.link === 'string' ? data.link : undefined;
  const workItemLabel = data?.title ? `Work Item #${id} – ${data.title}` : `Work Item #${id}`;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/work-items/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [String(id)], templateId: templateId || undefined, contextIds: selectedContexts })
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (r) => { setRunId(r.runId); setTab('results'); }
  });

  const runQ = useQuery<any>({
    queryKey: runId ? ['/api/runs', runId] : ['disabled'],
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data?.status && q.state.data.status !== 'completed' && q.state.data.status !== 'failed') ? 2000 : false,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });
  const runItemsQ = useQuery<RunItem[]>({
    queryKey: runId ? ['/api/runs', runId, 'items'] : ['disabled'],
    enabled: !!runId,
    refetchInterval: (q) => (runQ.data && runQ.data.status !== 'completed' && runQ.data.status !== 'failed') ? 2000 : false,
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/items`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  // Ensure a final fetch of items right after the run moves to completed
  useEffect(() => {
    if (runQ.data?.status === 'completed') {
      runItemsQ.refetch();
    }
  }, [runQ.data?.status]);

  const applyMutation = useMutation<ApplyResponse, Error, ApplyOptions>({
    mutationFn: async (opts) => {
      if (!runId) throw new Error('No AI run is available to apply.');
      const items = (runItemsQ.data ?? []).filter((runItem) => runItem.source_item_id === String(id));
      const res = await fetch(`/api/runs/${runId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedItemIds: items.map((item) => item.id),
          ...opts,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (result) => {
      const successes = result.results.filter((entry) => entry.success);
      const failures = result.results.filter((entry) => !entry.success);

      if (successes.length > 0) {
        pushToast({
          title: successes.length > 1 ? 'Changes applied to work items' : `Changes applied to ${workItemLabel}`,
          description: workItemLink ? (
            <a href={workItemLink} target="_blank" rel="noreferrer" className="text-primary underline">
              Open work item
            </a>
          ) : (
            'Azure DevOps accepted the update.'
          ),
        });
      }

      if (successes.length === 0 && failures.length > 0) {
        pushToast({
          title: 'Azure DevOps rejected the update',
          description: failures[0]?.error ?? 'No changes were applied.',
          variant: 'destructive',
        });
      }
    },
    onError: (err) => {
      pushToast({
        title: 'Failed to apply changes',
        description: err.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      if (runId) {
        runItemsQ.refetch();
        runQ.refetch();
      }
    },
  });

  if (isLoading) return <div className="py-6 text-sm">Loading…</div>;
  if (error) return <div className="py-6 text-sm text-red-600">{(error as any).message}</div>;

  return (
    <Tabs value={tab} onValueChange={(v)=> setTab(v as any)}>
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="generate">Generate</TabsTrigger>
        <TabsTrigger value="results" disabled={!runId}>Results</TabsTrigger>
      </TabsList>
      <TabsContent value="details">
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">{data.type} • {data.state} • {data.assignedTo ?? 'Unassigned'}</div>
          <div className="text-xl font-semibold">{data.title}</div>
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: data.descriptionHtml }} />
          {data.acceptanceCriteriaHtml && (<>
            <div className="font-medium">Acceptance Criteria</div>
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: data.acceptanceCriteriaHtml }} />
          </>)}
          <a href={data.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary"><ExternalLink className="w-4 h-4"/>Open in Azure DevOps</a>
        </div>
      </TabsContent>
      <TabsContent value="generate">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium mb-1">Template</div>
              <select
                className="w-full border rounded px-2 py-1"
                value={templateId}
                onChange={(event)=> setTemplateId(event.target.value)}
                disabled={templatesQ.isLoading}
              >
                <option value="">(None)</option>
                {(templatesQ.data||[]).map((t)=> (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.version ? ` (v${t.version})` : ''}
                  </option>
                ))}
              </select>
              {!templatesQ.isLoading && (templatesQ.data?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Publish a template to make it selectable.</p>
              )}
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Contexts</div>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-auto border rounded p-2">
                {availableContexts.map((context) => (
                  <Badge
                    key={context.id}
                    variant={selectedContexts.includes(context.id) ? 'default' : 'secondary'}
                    className="cursor-pointer"
                    onClick={() =>
                      setSelectedContexts((prev) =>
                        prev.includes(context.id) ? prev.filter((value) => value !== context.id) : [...prev, context.id],
                      )
                    }
                  >
                    {context.fileName || context.id}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <Button onClick={()=> generateMutation.mutate()} disabled={generateMutation.isPending} className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white">
            {generateMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2"/>Generate with AI</>
            )}
          </Button>
          {runQ.data && (
            <div className="text-sm text-muted-foreground">Run status: {runQ.data.status}</div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="results">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Switch id="dbgjson" checked={debugJson} onCheckedChange={setDebugJson} />
          <Label htmlFor="dbgjson">Show debug JSON</Label>
        </div>
        {(!runId) && <div className="text-sm">No run yet.</div>}
        {(runQ.data && runQ.data.status !== 'completed') && <div className="text-sm">Generating… status: {runQ.data.status}</div>}
        {runItemsQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin"/> Loading results…</div>
        ) : (
          <div className="space-y-4">
            {(() => {
              const items = (runItemsQ.data||[]);
              const subset = items.filter((ri)=> String(ri.source_item_id) === String(id));
              const toShow = subset.length ? subset : items.slice(0,1);
              return toShow.map((ri:any)=> (
                <div key={ri.id} className="space-y-6">
                  <FieldDiff title="Title" beforeText={ri.before_json?.title || ''} afterText={ri.after_json?.title || ''} />
                  <FieldDiff title="Description" beforeHtml={ri.before_json?.descriptionHtml || ''} afterHtml={ri.after_json?.descriptionHtml || ''} />
                  <FieldDiff title="Acceptance Criteria" beforeHtml={ri.before_json?.acceptanceCriteriaHtml || ''} afterHtml={ri.after_json?.acceptanceCriteriaHtml || ''} />
                  {/* Extra sections */}
                  <FieldList title="Tasks" beforeItems={[]} afterItems={ri.after_json?.enhanced?.tasks || []} />
                  <FieldList title="Test Cases" beforeItems={[]} afterItems={(ri.after_json?.enhanced?.testCases || []).map((tc:any)=> `Given ${tc.given}, When ${tc.when}, Then ${tc.then}`)} />
                  {debugJson && (
                    <div className="grid grid-cols-2 gap-4">
                      <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto">{JSON.stringify(ri.before_json, null, 2)}</pre>
                      <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto">{JSON.stringify(ri.after_json, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ));
            })()}
            <ApplyControls onApply={(opts)=> applyMutation.mutate(opts)} disabled={applyMutation.isPending || !(runItemsQ.data && runItemsQ.data.length)} />
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

// Small helper to toggle JSON debug in results without adding new UI components.
declare global { interface Window { __thriveiqDebug?: boolean } }
function DebugToggle() {
  const [on, setOn] = useState<boolean>(!!window.__thriveiqDebug);
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-2">
      <input id="dbg" type="checkbox" checked={on} onChange={(e)=> { window.__thriveiqDebug = e.target.checked; setOn(e.target.checked); }} />
      <label htmlFor="dbg">Show debug JSON</label>
    </div>
  );
}

function FieldDiff({ title, beforeText, afterText, beforeHtml, afterHtml }: { title: string; beforeText?: string; afterText?: string; beforeHtml?: string; afterHtml?: string }) {
  // If HTML provided, preserve headings/structure and render side-by-side without inline diff stripping
  if (beforeHtml !== undefined || afterHtml !== undefined) {
    return (
      <div>
        <div className="text-sm font-semibold mb-2">{title}</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border p-2 text-sm bg-red-50 border-red-200">
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: beforeHtml || '<p class="text-muted-foreground"><em>None</em></p>' }} />
          </div>
          <div className="rounded border p-2 text-sm bg-green-50 border-green-200">
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: afterHtml || '<p class="text-muted-foreground"><em>None</em></p>' }} />
          </div>
        </div>
      </div>
    );
  }

  // Otherwise do word-level diff for plain text
  const a = beforeText || '';
  const b = afterText || '';
  const diff = computeWordDiff(a, b);
  const renderLine = (parts: DiffPart[], color: 'red'|'green') => (
    <div className={`rounded border p-2 text-sm ${color==='red'?'bg-red-50 border-red-200':'bg-green-50 border-green-200'}`}>
      {parts.map((p, idx) => (
        <span key={idx} className={p.type==='common' ? '' : (p.type==='removed'?'bg-red-100 text-red-800 line-through':'bg-green-100 text-green-800')}>{p.text}</span>
      ))}
    </div>
  );
  return (
    <div>
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-3">
        {renderLine(diff.before, 'red')}
        {renderLine(diff.after, 'green')}
      </div>
    </div>
  );
}

type DiffPart = { text: string; type: 'common'|'added'|'removed' };
function computeWordDiff(a: string, b: string): { before: DiffPart[]; after: DiffPart[] } {
  const ws = /([\s]+)/;
  const ta = a.split(ws).filter(Boolean);
  const tb = b.split(ws).filter(Boolean);
  const m = ta.length, n = tb.length;
  const dp: number[][] = Array.from({ length: m+1 }, () => Array(n+1).fill(0));
  for (let i=1;i<=m;i++) {
    for (let j=1;j<=n;j++) {
      dp[i][j] = ta[i-1] === tb[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  const before: DiffPart[] = []; const after: DiffPart[] = [];
  let i=m, j=n;
  while (i>0 && j>0) {
    if (ta[i-1] === tb[j-1]) { before.unshift({text: ta[i-1], type:'common'}); after.unshift({text: tb[j-1], type:'common'}); i--; j--; }
    else if (dp[i-1][j] >= dp[i][j-1]) { before.unshift({text: ta[i-1], type:'removed'}); i--; }
    else { after.unshift({text: tb[j-1], type:'added'}); j--; }
  }
  while (i>0) { before.unshift({text: ta[i-1], type:'removed'}); i--; }
  while (j>0) { after.unshift({text: tb[j-1], type:'added'}); j--; }
  return { before, after };
}

function FieldList({ title, beforeItems, afterItems }: { title: string; beforeItems: string[]; afterItems: string[] }) {
  const render = (items: string[], color: 'red'|'green') => (
    <div className={`rounded border p-2 text-sm ${color==='red'?'bg-red-50 border-red-200':'bg-green-50 border-green-200'}`}>
      {(!items || items.length===0) ? <span className="text-muted-foreground">None</span> : (
        <ul className="list-disc pl-5">
          {items.map((t,idx)=> <li key={idx}>{t}</li>)}
        </ul>
      )}
    </div>
  );
  return (
    <div>
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-3">
        {render(beforeItems||[], 'red')}
        {render(afterItems||[], 'green')}
      </div>
    </div>
  );
}

interface FilterMultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  renderOption?: (option: string, checked: boolean) => ReactNode;
}

function FilterMultiSelect({
  label,
  options,
  selected,
  onToggle,
  onClear,
  renderOption,
}: FilterMultiSelectProps) {
  const hasSelection = selected.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={hasSelection ? "secondary" : "outline"}
          className="flex items-center gap-2"
        >
          <span>{label}</span>
          {hasSelection ? (
            <span className="flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-medium text-primary">
              {selected.length}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">All</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
          <span>{label}</span>
          {hasSelection && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={onClear}
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          <div className="flex flex-col gap-1 p-2">
            {options.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No options</p>
            ) : (
              options.map((option) => {
                const checked = selected.includes(option);
                return (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggle(option)}
                    />
                    <div className="flex-1 min-w-0">
                      {renderOption ? renderOption(option, checked) : (
                        <span className="truncate">{option}</span>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  values.forEach((value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed) {
      set.add(trimmed);
    }
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function buildFilterOptions(
  base: string[] | undefined,
  selected: string[] | undefined,
  fallback: string[],
  ensureUnassigned = false,
): string[] {
  const set = new Set<string>();
  const addValues = (values?: string[]) => {
    if (!values) return;
    values.forEach((value) => {
      if (!value) return;
      const trimmed = value.trim();
      if (trimmed) {
        set.add(trimmed);
      }
    });
  };

  const baseSource = base && base.length ? base : fallback;
  addValues(baseSource);
  addValues(selected);

  if (ensureUnassigned) {
    set.add('Unassigned');
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function typeBadgeClass(type?: string) {
  const t = (type || '').toLowerCase();
  if (t.includes('epic')) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300';
  if (t.includes('feature')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
  if (t.includes('user') || t.includes('story')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
  if (t.includes('task')) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
  if (t.includes('test')) return 'bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-300';
  return '';
}

function ApplyControls({ onApply, disabled }: { onApply: (opts: ApplyOptions)=> void; disabled: boolean }) {
  const [title, setTitle] = useState(true);
  const [desc, setDesc] = useState(true);
  const [ac, setAc] = useState(true);
  const [tasks, setTasks] = useState(true);
  const [tcs, setTcs] = useState(true);
  const [sp, setSp] = useState(true);
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm flex flex-wrap gap-3">
        <label className="flex items-center gap-1"><input type="checkbox" checked={title} onChange={(e)=> setTitle(e.target.checked)} /> Title</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={desc} onChange={(e)=> setDesc(e.target.checked)} /> Description</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={ac} onChange={(e)=> setAc(e.target.checked)} /> Acceptance/Test</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={tasks} onChange={(e)=> setTasks(e.target.checked)} /> Create Tasks</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={tcs} onChange={(e)=> setTcs(e.target.checked)} /> Create Test Cases</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={sp} onChange={(e)=> setSp(e.target.checked)} /> Set Story Points</label>
      </div>
      <Button
        onClick={() => {
          const selectedFields = [
            title ? 'title' : null,
            desc ? 'description' : null,
            ac ? 'acceptance' : null,
          ].filter((field): field is string => typeof field === 'string');

          onApply({
            selectedFields,
            createTasks: tasks,
            createTestCases: tcs,
            setStoryPoints: sp,
          });
        }}
        disabled={disabled}
      >
        Apply Changes
      </Button>
    </div>
  );
}
