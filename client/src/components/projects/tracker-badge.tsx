import { Badge } from "@/components/ui/badge";
import { Cloud, MinusCircle, Workflow } from "lucide-react";
import type { ReactNode } from "react";

interface TrackerBadgeProps {
  type: "jira" | "azure_devops" | "none";
  label: string;
}

const ICONS: Record<string, ReactNode> = {
  jira: <Workflow className="w-3.5 h-3.5" />,
  azure_devops: <Cloud className="w-3.5 h-3.5" />,
  none: <MinusCircle className="w-3.5 h-3.5" />,
};

const CLASSES: Record<string, string> = {
  jira: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200",
  azure_devops: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200",
  none: "bg-slate-100 text-slate-700 dark:bg-slate-900/20 dark:text-slate-300",
};

export function TrackerBadge({ type, label }: TrackerBadgeProps) {
  const icon = ICONS[type] ?? ICONS.none;
  const className = CLASSES[type] ?? CLASSES.none;

  return (
    <Badge className={`flex items-center gap-1 ${className}`}>
      {icon}
      <span>{label}</span>
    </Badge>
  );
}
