import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, FileText, Beaker, History, Rocket, Copy, Archive, Undo2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  status: 'draft' | 'published';
  body: string;
  variables: VariableDescriptor[];
  examplePayload: unknown;
  publishedAt?: string | null;
  createdAt?: string;
}

interface TemplateSummary {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  updatedAt?: string;
  latestVersion?: TemplateVersion | null;
  publishedVersion?: TemplateVersion | null;
  draftVersion?: TemplateVersion | null;
}

interface VariableDescriptor {
  key: string;
  label: string;
  type: 'string' | 'text' | 'number' | 'boolean';
  required?: boolean;
  hint?: string;
}

interface TemplateFormState {
  name: string;
  description: string;
  body: string;
  variables: VariableDescriptor[];
  examplePayload: string;
}

const DEFAULT_FORM: TemplateFormState = {
  name: '',
  description: '',
  body: '',
  variables: [],
  examplePayload: '',
};

const VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
] as const;

type ViewValue = (typeof VIEWS)[number]['value'];

interface TemplatesResponse {
  items: TemplateSummary[];
  count: number;
  offset: number;
  limit: number;
}

function createEmptyVariable(): VariableDescriptor {
  return { key: '', label: '', type: 'string', required: false, hint: '' };
}

function TemplateVariablesEditor({
  variables,
  onChange,
  disabled,
}: {
  variables: VariableDescriptor[];
  onChange: (next: VariableDescriptor[]) => void;
  disabled?: boolean;
}) {
  const handleUpdate = (index: number, field: keyof VariableDescriptor, value: string | boolean) => {
    const next = variables.map((variable, idx) =>
      idx === index ? { ...variable, [field]: value } : variable,
    );
    onChange(next);
  };

  const removeVariable = (index: number) => {
    onChange(variables.filter((_, idx) => idx !== index));
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Variables</h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...variables, createEmptyVariable()])}
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      {variables.length === 0 ? (
        <p className="text-sm text-muted-foreground">No variables defined. Add one to parameterize the template.</p>
      ) : (
        <div className="space-y-4">
          {variables.map((variable, index) => (
            <div key={index} className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Variable {index + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={disabled}
                  onClick={() => removeVariable(index)}
                >
                  Remove
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`var-key-${index}`}>Key</Label>
                  <Input
                    id={`var-key-${index}`}
                    placeholder="persona"
                    value={variable.key}
                    disabled={disabled}
                    onChange={(event) => handleUpdate(index, 'key', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor={`var-label-${index}`}>Label</Label>
                  <Input
                    id={`var-label-${index}`}
                    placeholder="Persona"
                    value={variable.label}
                    disabled={disabled}
                    onChange={(event) => handleUpdate(index, 'label', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor={`var-type-${index}`}>Type</Label>
                  <select
                    id={`var-type-${index}`}
                    className="w-full border rounded-md px-2 py-2 text-sm"
                    value={variable.type}
                    disabled={disabled}
                    onChange={(event) => handleUpdate(index, 'type', event.target.value as VariableDescriptor['type'])}
                  >
                    <option value="string">Short text</option>
                    <option value="text">Long text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                  </select>
                </div>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <Label htmlFor={`var-required-${index}`} className="text-sm">Required</Label>
                  <Switch
                    id={`var-required-${index}`}
                    checked={!!variable.required}
                    disabled={disabled}
                    onCheckedChange={(checked) => handleUpdate(index, 'required', checked)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor={`var-hint-${index}`}>Hint</Label>
                <Input
                  id={`var-hint-${index}`}
                  placeholder="e.g., Primary stakeholder persona"
                  value={variable.hint ?? ''}
                  disabled={disabled}
                  onChange={(event) => handleUpdate(index, 'hint', event.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateForm({
  value,
  onChange,
  disabled,
  showName,
}: {
  value: TemplateFormState;
  onChange: (next: TemplateFormState) => void;
  disabled?: boolean;
  showName?: boolean;
}) {
  return (
    <div className="space-y-4">
      {showName && (
        <div className="space-y-2">
          <Label htmlFor="template-name">Template name</Label>
          <Input
            id="template-name"
            placeholder="Persona-driven user story"
            value={value.name}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="template-description">Description</Label>
        <Textarea
          id="template-description"
          placeholder="Short summary visible to collaborators"
          value={value.description}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </div>
      <TemplateVariablesEditor
        variables={value.variables}
        disabled={disabled}
        onChange={(nextVariables) => onChange({ ...value, variables: nextVariables })}
      />
      <div className="space-y-2">
        <Label htmlFor="template-body">Prompt body</Label>
        <Textarea
          id="template-body"
          placeholder="Write the AI prompt body. Use ${variable_key} placeholders."
          className="h-48"
          value={value.body}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, body: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="template-example">Example payload (JSON)</Label>
        <Textarea
          id="template-example"
          placeholder='{"variables": {"persona": "HR Manager"}}'
          className="font-mono text-sm h-40"
          value={value.examplePayload}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, examplePayload: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Optional: Provide sample variable values and metadata used in tests.
        </p>
      </div>
    </div>
  );
}

function parseExamplePayload(raw: string) {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Example payload must be valid JSON');
  }
}

function validateVariables(variables: VariableDescriptor[]) {
  const seen = new Set<string>();
  for (const variable of variables) {
    if (!variable.key.trim()) throw new Error('Variable keys cannot be empty');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.key)) {
      throw new Error(`Invalid variable key: ${variable.key}`);
    }
    if (seen.has(variable.key)) throw new Error(`Duplicate variable key: ${variable.key}`);
    seen.add(variable.key);
  }
  return variables.map(variable => ({
    ...variable,
    required: !!variable.required,
    hint: variable.hint?.trim() ? variable.hint : undefined,
  }));
}

function TemplateList({
  templates,
  onEdit,
  onPublish,
  onArchive,
  onDuplicateDraft,
  onViewHistory,
  loading,
  busy,
  view,
}: {
  templates: TemplateSummary[];
  onEdit: (template: TemplateSummary) => void;
  onPublish: (template: TemplateSummary) => void;
  onArchive: (template: TemplateSummary) => void;
  onDuplicateDraft: (template: TemplateSummary) => void;
  onViewHistory: (template: TemplateSummary) => void;
  loading: boolean;
  busy: boolean;
  view?: ViewValue;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading templates...
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3" />
        <p className="font-medium">No templates match the current filters.</p>
        <p className="text-sm">Create a new template to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {templates.map(template => {
        const latestVersion = template.latestVersion;
        const draftVersion = template.draftVersion;
        const publishedVersion = template.publishedVersion;
        const updatedRelative = template.updatedAt
          ? formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true })
          : 'Recently';
        return (
          <Card key={template.id} className="border-muted shadow-sm">
            <CardContent className="p-5 md:p-6">
              <div className="flex flex-wrap gap-4 items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{template.name}</h3>
                    <Badge variant={template.status === 'active' ? 'default' : 'secondary'}>
                      {template.status === 'active' ? 'Active' : 'Archived'}
                    </Badge>
                    {latestVersion && (
                      <Badge variant={latestVersion.status === 'draft' ? 'outline' : 'default'}>
                        v{latestVersion.version} · {latestVersion.status}
                      </Badge>
                    )}
                  </div>
                  {template.description && (
                    <p className="text-sm text-muted-foreground max-w-2xl">{template.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-1">
                    {publishedVersion && <span>Published v{publishedVersion.version}</span>}
                    {draftVersion && view !== 'published' && <span>Draft v{draftVersion.version}</span>}
                    <span>Updated {updatedRelative}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2 md:mt-0">
                  <Button variant="outline" size="sm" onClick={() => onViewHistory(template)} disabled={busy}>
                    <History className="h-4 w-4 mr-1" /> Versions
                  </Button>
                  {draftVersion ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => onEdit(template)} disabled={busy}>
                        <Beaker className="h-4 w-4 mr-1" /> Edit Draft
                      </Button>
                      <Button size="sm" onClick={() => onPublish(template)} disabled={busy}>
                        <Rocket className="h-4 w-4 mr-1" /> Publish
                      </Button>
                    </>
                  ) : template.status === 'active' ? (
                    <Button variant="outline" size="sm" onClick={() => onDuplicateDraft(template)} disabled={busy}>
                      <Copy className="h-4 w-4 mr-1" /> New Draft
                    </Button>
                  ) : null}
                  {template.status === 'active' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => onArchive(template)}
                      disabled={busy}
                    >
                      <Archive className="h-4 w-4 mr-1" /> Archive
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => onArchive(template)}
                      disabled={busy}
                    >
                      <Undo2 className="h-4 w-4 mr-1" /> Restore
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function useTemplateMutations(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = async () => {
    if (!projectId) return;
    await queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'templates'] });
  };

  const createTemplate = useMutation({
    mutationFn: async (input: TemplateFormState) => {
      if (!projectId) throw new Error('Project required');
      const variables = validateVariables(input.variables);
      const examplePayload = parseExamplePayload(input.examplePayload);
      const res = await fetch(`/api/projects/${projectId}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          body: input.body,
          variables,
          examplePayload,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: 'Template created', description: 'Draft saved as version 1.' });
      await invalidate();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create template', description: error.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ template, payload }: { template: TemplateSummary; payload: TemplateFormState }) => {
      if (!projectId) throw new Error('Project required');
      const variables = validateVariables(payload.variables);
      const examplePayload = parseExamplePayload(payload.examplePayload);
      if (payload.name !== template.name || payload.description !== (template.description ?? '')) {
        const res = await fetch(`/api/projects/${projectId}/templates/${template.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: payload.name, description: payload.description }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      if (template.draftVersion) {
        const res = await fetch(
          `/api/projects/${projectId}/templates/${template.id}/versions/${template.draftVersion.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              body: payload.body,
              variables,
              examplePayload,
            }),
          },
        );
        if (!res.ok) throw new Error(await res.text());
      }
    },
    onSuccess: async () => {
      toast({ title: 'Draft updated', description: 'Template draft changes saved.' });
      await invalidate();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update draft', description: error.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const publishTemplate = useMutation({
    mutationFn: async (template: TemplateSummary) => {
      if (!projectId) throw new Error('Project required');
      if (!template.draftVersion) throw new Error('No draft to publish');
      const res = await fetch(
        `/api/projects/${projectId}/templates/${template.id}/versions/${template.draftVersion.id}/publish`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: 'Template published', description: 'Draft promoted to published version.' });
      await invalidate();
    },
    onError: (error: any) => {
      toast({ title: 'Publish failed', description: error.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const archiveTemplate = useMutation({
    mutationFn: async (template: TemplateSummary) => {
      if (!projectId) throw new Error('Project required');
      const res = await fetch(`/api/projects/${projectId}/templates/${template.id}`, {
        method: template.status === 'active' ? 'DELETE' : 'PUT',
        headers: template.status === 'active' ? undefined : { 'Content-Type': 'application/json' },
        body: template.status === 'active' ? undefined : JSON.stringify({ status: 'active' }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: async (_data, template) => {
      toast({
        title: template.status === 'active' ? 'Template archived' : 'Template restored',
        description: template.status === 'active'
          ? 'Template removed from selection lists.'
          : 'Template reactivated.',
      });
      await invalidate();
    },
    onError: (error: any) => {
      toast({ title: 'Update failed', description: error.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const duplicateDraft = useMutation({
    mutationFn: async (template: TemplateSummary) => {
      if (!projectId) throw new Error('Project required');
      const res = await fetch(`/api/projects/${projectId}/templates/${template.id}/versions`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: 'Draft created', description: 'New draft version ready for editing.' });
      await invalidate();
    },
    onError: (error: any) => {
      toast({ title: 'Draft creation failed', description: error.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  return {
    createTemplate,
    updateTemplate,
    publishTemplate,
    archiveTemplate,
    duplicateDraft,
  };
}

export default function Templates() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const { projectId, isLoading: loadingProject } = useCurrentProject();

  const [view, setView] = useState<ViewValue>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<TemplateSummary | null>(null);
  const [historyTemplate, setHistoryTemplate] = useState<TemplateSummary | null>(null);

  const [createForm, setCreateForm] = useState<TemplateFormState>({ ...DEFAULT_FORM });
  const [editForm, setEditForm] = useState<TemplateFormState>({ ...DEFAULT_FORM });

  const templatesQuery = useQuery<TemplatesResponse>({
    queryKey: ['/api/projects', projectId, 'templates', view, search],
    enabled: !!projectId && isAuthenticated && !isLoading && !loadingProject,
    queryFn: async () => {
      if (!projectId) throw new Error('Project required');
      const params = new URLSearchParams({ view, limit: '50' });
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/projects/${projectId}/templates?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const versionsQuery = useQuery<{ versions: TemplateVersion[] }>({
    queryKey: historyTemplate ? ['/api/projects', projectId, 'templates', historyTemplate.id, 'versions'] : ['disabled'],
    enabled: !!projectId && !!historyTemplate,
    queryFn: async () => {
      if (!projectId || !historyTemplate) throw new Error('Template required');
      const res = await fetch(`/api/projects/${projectId}/templates/${historyTemplate.id}/versions`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { createTemplate, updateTemplate, publishTemplate, archiveTemplate, duplicateDraft } = useTemplateMutations(projectId);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: 'Unauthorized',
        description: 'You are logged out. Logging in again...',
        variant: 'destructive',
      });
      setTimeout(() => {
        window.location.href = '/login';
      }, 500);
    }
  }, [isAuthenticated, isLoading, toast]);

  useEffect(() => {
    if (editTemplate && editTemplate.draftVersion) {
      const draft = editTemplate.draftVersion;
      setEditForm({
        name: editTemplate.name,
        description: editTemplate.description ?? '',
        body: draft.body,
        variables: draft.variables,
        examplePayload: draft.examplePayload ? JSON.stringify(draft.examplePayload, null, 2) : '',
      });
    } else {
      setEditForm({ ...DEFAULT_FORM });
    }
  }, [editTemplate]);

  if (isLoading || loadingProject || !isAuthenticated || !projectId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <span className="text-foreground">Loading templates...</span>
        </div>
      </div>
    );
  }

  const templates = templatesQuery.data?.items ?? [];

  const handleCreateSubmit = async () => {
    try {
      await createTemplate.mutateAsync(createForm);
      setCreateForm({ ...DEFAULT_FORM });
      setCreateOpen(false);
    } catch (error: any) {
      toast({ title: 'Unable to create template', description: error.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  const handleEditSubmit = async () => {
    if (!editTemplate) return;
    try {
      await updateTemplate.mutateAsync({ template: editTemplate, payload: editForm });
      setEditTemplate(null);
    } catch (error: any) {
      toast({ title: 'Unable to update draft', description: error.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <main className="flex-1 overflow-auto p-6" data-testid="templates-main">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Templates</h1>
            <p className="text-muted-foreground">Create and manage AI generation templates for your project.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Template
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Template Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <Tabs value={view} onValueChange={(value) => setView(value as ViewValue)}>
              <TabsList className="mb-3">
                {VIEWS.map(tab => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="flex flex-wrap items-center gap-3 mt-1 mb-2">
                <Input
                  placeholder="Search templates"
                  className="w-full max-w-md"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {templatesQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <TabsContent value={view} className="mt-0">
                <TemplateList
                  templates={templates}
                  loading={templatesQuery.isLoading}
                  onEdit={(template) => setEditTemplate(template)}
                  onPublish={(template) => publishTemplate.mutate(template)}
                  onArchive={(template) => archiveTemplate.mutate(template)}
                  onDuplicateDraft={(template) => duplicateDraft.mutate(template)}
                  onViewHistory={(template) => setHistoryTemplate(template)}
                  busy={
                    createTemplate.isPending ||
                    updateTemplate.isPending ||
                    publishTemplate.isPending ||
                    archiveTemplate.isPending ||
                    duplicateDraft.isPending
                  }
                  view={view}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreateForm({ ...DEFAULT_FORM }); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
            <DialogDescription>Provide a name, variables, and prompt body. The draft will be saved as version 1.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
              <TemplateForm value={createForm} onChange={setCreateForm} showName disabled={createTemplate.isPending} />
          </ScrollArea>
          <DialogFooter className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createTemplate.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubmit} disabled={createTemplate.isPending}>
              {createTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTemplate} onOpenChange={(open) => { if (!open) setEditTemplate(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit draft</DialogTitle>
            <DialogDescription>Adjust the draft version before publishing.</DialogDescription>
          </DialogHeader>
          {editTemplate ? (
            <ScrollArea className="max-h-[70vh] pr-4">
            <TemplateForm value={editForm} onChange={setEditForm} showName disabled={updateTemplate.isPending} />
            </ScrollArea>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTemplate(null)} disabled={updateTemplate.isPending}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={updateTemplate.isPending || !editTemplate}>
              {updateTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyTemplate} onOpenChange={(open) => { if (!open) setHistoryTemplate(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Template versions</DialogTitle>
            <DialogDescription>Track publication history and drafts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {versionsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading versions...
              </div>
            ) : versionsQuery.data?.versions?.length ? (
              <div className="space-y-3">
                {versionsQuery.data.versions.map(version => (
                  <div key={version.id} className="border rounded-md p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">Version {version.version}</span>
                      <Badge variant={version.status === 'published' ? 'default' : 'outline'}>{version.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created {version.createdAt ? formatDistanceToNow(new Date(version.createdAt), { addSuffix: true }) : 'recently'}
                      {version.publishedAt && (
                        <span className="ml-2">· Published {formatDistanceToNow(new Date(version.publishedAt), { addSuffix: true })}</span>
                      )}
                    </div>
                    <Separator className="my-2" />
                    <pre className="text-xs bg-muted/60 rounded-md p-3 whitespace-pre-wrap max-h-40 overflow-auto">
                      {version.body}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No versions yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
