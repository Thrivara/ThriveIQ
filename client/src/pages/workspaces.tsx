import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Users } from "lucide-react";
import { useWorkspaceContext, WorkspaceRole } from "@/context/workspace-context";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WorkspaceDetailResponse {
  workspace: {
    id: string;
    name: string;
    description: string | null;
    billingInfo: Record<string, unknown> | null;
    ownerId: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    role: WorkspaceRole;
  };
}

interface WorkspaceMembersResponse {
  members: Array<{
    userId: string;
    role: WorkspaceRole;
    user: {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }>;
  currentRole: WorkspaceRole;
}

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  contributor: "Contributor",
  viewer: "Viewer",
};

export default function WorkspaceManagement() {
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspace,
    isLoading: workspacesLoading,
    refetch,
  } = useWorkspaceContext();
  const { user } = useAuth();
  const currentUserId = (user as { id?: string } | undefined)?.id ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const workspaceId = activeWorkspaceId;

  const detailQuery = useQuery<WorkspaceDetailResponse>({
    queryKey: workspaceId ? ["/api/workspaces", workspaceId] : ["disabled", "workspace"],
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const membersQuery = useQuery<WorkspaceMembersResponse>({
    queryKey: workspaceId ? ["/api/workspaces", workspaceId, "members"] : ["disabled", "members"],
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const workspaceRole = detailQuery.data?.workspace.role ?? membersQuery.data?.currentRole ?? activeWorkspace?.role ?? "viewer";
  const canManage = workspaceRole === "owner";

  const [name, setName] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("contributor");

  useEffect(() => {
    if (detailQuery.data?.workspace) {
      setName(detailQuery.data.workspace.name ?? "");
      setDescription(detailQuery.data.workspace.description ?? "");
    }
  }, [detailQuery.data?.workspace]);

  const updateWorkspace = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Workspace required");
      const payloadDescription = description && description.trim().length ? description.trim() : null;
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), description: payloadDescription }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<WorkspaceDetailResponse>;
    },
    onSuccess: async () => {
      toast({ title: "Workspace updated" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId] }),
        refetch(),
      ]);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update workspace",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const inviteMember = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Workspace required");
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Invite sent" });
      setInviteEmail("");
      setInviteRole("contributor");
      await queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "members"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to invite member",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMemberRole = useMutation({
    mutationFn: async (payload: { userId: string; role: WorkspaceRole }) => {
      if (!workspaceId) throw new Error("Workspace required");
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${payload.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: payload.role }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Member role updated" });
      await queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "members"] });
      await refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update member",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!workspaceId) throw new Error("Workspace required");
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${targetUserId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async (_data, removedUserId) => {
      await refetch();
      toast({ title: "Member removed" });
      await queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "members"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove member",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const members = membersQuery.data?.members ?? ([] as WorkspaceMembersResponse['members']);
  const isLoading = workspacesLoading || detailQuery.isLoading;

  const sortedMembers = useMemo<WorkspaceMembersResponse['members']>(() => {
    return [...members].sort((a, b) => {
      if (a.role === b.role) {
        const nameA = a.user?.firstName || a.user?.email || "";
        const nameB = b.user?.firstName || b.user?.email || "";
        return nameA.localeCompare(nameB);
      }
      const order: WorkspaceRole[] = ["owner", "admin", "contributor", "viewer"];
      return order.indexOf(a.role) - order.indexOf(b.role);
    }) as WorkspaceMembersResponse['members'];
  }, [members]);

  return (
    <main className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Workspace Management</h1>
            <p className="text-sm text-muted-foreground">
              Configure workspace details and manage team membership.
          </p>
        </div>
        <div className="w-64">
          <Select
            value={activeWorkspaceId ?? undefined}
            onValueChange={(value) => setActiveWorkspace(value)}
            disabled={workspaces.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((ws) => (
                <SelectItem key={ws.id} value={ws.id}>
                  {ws.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!workspaceId ? (
        <Card>
          <CardContent className="py-8 flex flex-col items-center justify-center text-center space-y-2">
            <Users className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Join or create a workspace to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr,1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Workspace details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center space-x-3 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading workspace...</span>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Workspace name"
                      disabled={!canManage || updateWorkspace.isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={description ?? ""}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Share context about this workspace"
                      rows={4}
                      disabled={!canManage || updateWorkspace.isPending}
                    />
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Role: {ROLE_LABEL[workspaceRole]}</span>
                  </div>
                  {canManage ? (
                    <Button onClick={() => updateWorkspace.mutate()} disabled={updateWorkspace.isPending}>
                      {updateWorkspace.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving
                        </>
                      ) : (
                        "Save changes"
                      )}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Only workspace owners can modify workspace details.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Invite a team member</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="you@example.com"
                  disabled={!canManage || inviteMember.isPending}
                  type="email"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) => setInviteRole(value as WorkspaceRole)}
                  disabled={!canManage || inviteMember.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => inviteMember.mutate()}
                disabled={!canManage || inviteMember.isPending || !inviteEmail.trim()}
              >
                {inviteMember.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending invite
                  </>
                ) : (
                  "Send invite"
                )}
              </Button>
              {!canManage && (
                <p className="text-xs text-muted-foreground">
                  Only workspace owners can invite members.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {workspaceId && (
        <Card>
          <CardHeader>
            <CardTitle>Workspace members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {membersQuery.isLoading ? (
              <div className="flex items-center space-x-3 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading members...</span>
              </div>
            ) : sortedMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="w-[160px]">Role</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.map((member) => {
                    const canModifyMember = canManage && member.userId !== currentUserId;
                    const fullName = member.user?.firstName || member.user?.lastName
                      ? `${member.user?.firstName ?? ''} ${member.user?.lastName ?? ''}`.trim()
                      : null;
                    const displayName = fullName || member.user?.email || 'Member';
                    return (
                      <TableRow key={member.userId}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{displayName}</span>
                            {fullName && member.user?.email && (
                              <span className="text-xs text-muted-foreground">{member.user.email}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{member.user?.email ?? '—'}</TableCell>
                        <TableCell>
                          {canManage ? (
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                updateMemberRole.mutate({ userId: member.userId, role: value as WorkspaceRole })
                              }
                              disabled={!canModifyMember || updateMemberRole.isPending}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(ROLE_LABEL).map(([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {canModifyMember ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMember.mutate(member.userId)}
                              disabled={removeMember.isPending}
                            >
                              Remove
                            </Button>
                          ) : member.userId === currentUserId ? (
                            <Badge variant="outline">You</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
      </div>
    </main>
  );
}
