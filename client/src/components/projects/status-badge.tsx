import { Badge } from "@/components/ui/badge";
import type { ProjectStatusFilter } from "@/hooks/useProjectFilters";

interface StatusBadgeProps {
  status: ProjectStatusFilter | "active" | "planning" | "review" | "archived";
}

const STATUS_VARIANTS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200",
  planning: "bg-sky-100 text-sky-800 dark:bg-sky-900/20 dark:text-sky-200",
  review: "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200",
  archived: "bg-slate-200 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  planning: "Planning",
  review: "In Review",
  archived: "Archived",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const key = (status ?? "active").toLowerCase();
  const className = STATUS_VARIANTS[key] ?? STATUS_VARIANTS.active;
  const label = STATUS_LABELS[key] ?? STATUS_LABELS.active;

  return <Badge className={className}>{label}</Badge>;
}
