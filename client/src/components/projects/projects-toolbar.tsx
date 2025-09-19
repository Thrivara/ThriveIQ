import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProjectStatusFilter, TrackerFilter } from "@/hooks/useProjectFilters";
import { Plus, SlidersHorizontal } from "lucide-react";
import { ChangeEvent } from "react";

interface ProjectsToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  status: ProjectStatusFilter;
  onStatusChange: (status: ProjectStatusFilter) => void;
  tracker: TrackerFilter;
  onTrackerChange: (tracker: TrackerFilter) => void;
  onOpenAdvancedFilters: () => void;
  onNewProject: () => void;
  isCreating?: boolean;
}

export function ProjectsToolbar({
  searchValue,
  onSearchChange,
  status,
  onStatusChange,
  tracker,
  onTrackerChange,
  onOpenAdvancedFilters,
  onNewProject,
  isCreating,
}: ProjectsToolbarProps) {
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder="Search projects"
          value={searchValue}
          onChange={handleSearchChange}
          className="w-full md:max-w-xs"
        />
        <Select value={status} onValueChange={(value) => onStatusChange(value as ProjectStatusFilter)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="planning">Planning</SelectItem>
            <SelectItem value="review">In Review</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tracker} onValueChange={(value) => onTrackerChange(value as TrackerFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tracker" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All trackers</SelectItem>
            <SelectItem value="jira">Jira</SelectItem>
            <SelectItem value="azure_devops">Azure DevOps</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={onOpenAdvancedFilters} className="gap-2">
          <SlidersHorizontal className="h-4 w-4" /> More Filters
        </Button>
      </div>
      <Button onClick={onNewProject} className="gap-2" disabled={isCreating}>
        <Plus className="h-4 w-4" /> New Project
      </Button>
    </div>
  );
}
