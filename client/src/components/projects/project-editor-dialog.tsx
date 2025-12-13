import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProjectStatusFilter } from "@/hooks/useProjectFilters";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(255),
  description: z
    .string()
    .max(2000, "Description must be under 2000 characters")
    .optional()
    .or(z.literal(""))
    .nullable(),
  guardrails: z
    .string()
    .max(8000, "Guardrails must be under 8000 characters")
    .optional()
    .or(z.literal(""))
    .nullable(),
  status: z.enum(["active", "planning", "review", "archived"]),
});

export type ProjectFormValues = z.infer<typeof projectSchema>;

interface ProjectEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProjectFormValues & { teamUserIds?: string[] }) => Promise<void>;
  isSubmitting?: boolean;
  project?: {
    name: string;
    description: string | null;
    status: ProjectStatusFilter;
    guardrails?: string | null;
  } | null;
  members?: Array<{
    userId: string;
    role: string;
    user: { id: string; email: string | null; firstName: string | null; lastName: string | null } | null;
  }>;
  initialTeamUserIds?: string[] | null;
}

export function ProjectEditorDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  project,
  members = [],
  initialTeamUserIds = null,
}: ProjectEditorDialogProps) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      description: "",
      guardrails: "",
      status: "active",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: project?.name ?? "",
        description: project?.description ?? "",
        guardrails: project?.guardrails ?? "",
        status: (project?.status ?? "active") as ProjectFormValues["status"],
      });
    }
  }, [form, open, project]);

  // Team selection state
  const [teamSelection, setTeamSelection] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      const seed = new Set((initialTeamUserIds ?? []) as string[]);
      setTeamSelection(seed);
    }
  }, [open, initialTeamUserIds]);

  const handleToggleMember = (userId: string, checked: boolean | "indeterminate") => {
    setTeamSelection((prev) => {
      const next = new Set(prev);
      if (checked === true) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const selectedIds = useMemo(() => Array.from(teamSelection), [teamSelection]);

  const handleSubmit = async (values: ProjectFormValues) => {
    await onSubmit({ ...values, teamUserIds: selectedIds });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter project name" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add a short summary"
                      className="min-h-[100px]"
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(event.target.value)}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="guardrails"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guardrails</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="List the allowed platforms, technologies, and constraints for this project"
                      className="min-h-[140px]"
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(event.target.value)}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="review">In Review</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Team Members</FormLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-auto rounded-md border p-2">
                {members.length === 0 ? (
                  <div className="text-sm text-muted-foreground px-2 py-1">No workspace members found.</div>
                ) : (
                  members.map((m) => {
                    const label = m.user
                      ? `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim() || (m.user.email ?? m.user.id)
                      : m.userId;
                    return (
                      <label key={m.userId} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={teamSelection.has(m.userId)}
                          onCheckedChange={(c) => handleToggleMember(m.userId, c)}
                          id={`m-${m.userId}`}
                        />
                        <span className="truncate" title={label}>{label}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {project ? "Save Changes" : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
