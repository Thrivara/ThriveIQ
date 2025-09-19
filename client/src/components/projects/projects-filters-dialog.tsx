import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { HasIntegrationsFilter } from "@/hooks/useProjectFilters";

interface MemberOption {
  userId: string;
  role: string;
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface ProjectsFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: {
    updatedAfter: string | null;
    ownerId: string | null;
    hasIntegrations: HasIntegrationsFilter;
  };
  members: MemberOption[];
  onApply: (filters: { updatedAfter: string | null; ownerId: string | null; hasIntegrations: HasIntegrationsFilter }) => void;
  onReset: () => void;
}

export function ProjectsFiltersDialog({
  open,
  onOpenChange,
  filters,
  members,
  onApply,
  onReset,
}: ProjectsFiltersDialogProps) {
  const [updatedAfter, setUpdatedAfter] = useState<string | null>(filters.updatedAfter);
  const [ownerId, setOwnerId] = useState<string | null>(filters.ownerId);
  const [hasIntegrations, setHasIntegrations] = useState<HasIntegrationsFilter>(filters.hasIntegrations);

  useEffect(() => {
    if (open) {
      setUpdatedAfter(filters.updatedAfter);
      setOwnerId(filters.ownerId);
      setHasIntegrations(filters.hasIntegrations);
    }
  }, [open, filters]);

  const handleApply = () => {
    onApply({
      updatedAfter,
      ownerId,
      hasIntegrations,
    });
    onOpenChange(false);
  };

  const ownerOptions = members.map((member) => {
    const name = member.user
      ? member.user.firstName && member.user.lastName
        ? `${member.user.firstName} ${member.user.lastName}`
        : member.user.email ?? member.user.id
      : member.userId;
    return {
      id: member.userId,
      label: name,
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Advanced Filters</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="updated-after">Updated After</Label>
            <Input
              id="updated-after"
              type="date"
              value={updatedAfter ?? ""}
              onChange={(event) => setUpdatedAfter(event.target.value || null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="owner">Owner</Label>
            <Select value={ownerId ?? ""} onValueChange={(value) => setOwnerId(value || null)}>
              <SelectTrigger id="owner">
                <SelectValue placeholder="All owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All owners</SelectItem>
                {ownerOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="has-integrations">Integrations</Label>
            <Select value={hasIntegrations} onValueChange={(value) => setHasIntegrations(value as HasIntegrationsFilter)}>
              <SelectTrigger id="has-integrations">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="with">With integrations</SelectItem>
                <SelectItem value="without">Without integrations</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onReset();
              setUpdatedAfter(null);
              setOwnerId(null);
              setHasIntegrations("all");
            }}
          >
            Reset
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
