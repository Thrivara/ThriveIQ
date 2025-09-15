import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Folder, Upload, FileText, File, Trash2, MoreHorizontal, Info, AlertTriangle } from "lucide-react";

import { useCurrentProject } from "@/hooks/useCurrentProject";

type ContextStatus = "uploading" | "indexing" | "ready" | "failed" | "deleted" | "unknown";

interface ContextFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  provider: string | null;
  status: ContextStatus;
  openaiFileId: string | null;
  chunkCount: number | null;
  lastError?: string | null;
  metadata: {
    originalName?: string;
    uploadedAt?: string;
    hasTextContent?: boolean;
  };
  createdAt: string;
}

export default function ContextFiles() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const { projectId, isLoading: loadingProject } = useCurrentProject();
  const [dragActive, setDragActive] = useState(false);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch context files
  const {
    data: contextFiles = [],
    isLoading: filesLoading,
    isFetching,
    refetch,
  } = useQuery<ContextFile[]>({
    queryKey: projectId ? ["/api/projects", projectId, "contexts"] : ["disabled"],
    enabled: !!projectId && isAuthenticated && !isLoading,
    refetchInterval: (query) => {
      const pending = (query.state.data as ContextFile[] | undefined)?.some((ctx) =>
        ["uploading", "indexing", "unknown"].includes(ctx.status)
      );
      return pending ? 4000 : false;
    },
    refetchOnWindowFocus: false,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      if (!projectId) throw new Error('No project selected');
      const response = await fetch(`/api/projects/${projectId}/contexts/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "File uploaded successfully",
        description: "We will index this file with OpenAI and notify you when it's ready.",
      });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "contexts"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    },
  });

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

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async (contextId: string) => {
      if (!projectId) throw new Error("No project selected");
      const res = await fetch(`/api/projects/${projectId}/contexts/${contextId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || "Failed to delete context");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Context removed", description: "The file has been removed from this project." });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "contexts"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete context",
        description: error.message || "Try again in a few seconds.",
        variant: "destructive",
      });
    },
  });

  const handleStatusRefresh = useCallback(
    async (contextId: string) => {
      if (!projectId) return;
      await fetch(`/api/projects/${projectId}/contexts/${contextId}/status`);
      refetch();
    },
    [projectId, refetch]
  );

  const statusMeta = useMemo<Record<ContextStatus, { label: string; tone: string }>>(
    () => ({
      uploading: { label: "Uploading", tone: "bg-muted text-muted-foreground" },
      indexing: { label: "Indexing", tone: "bg-amber-500/15 text-amber-600 border border-amber-500/30" },
      ready: { label: "Ready", tone: "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30" },
      failed: { label: "Failed", tone: "bg-destructive/10 text-destructive border border-destructive/30" },
      deleted: { label: "Deleted", tone: "bg-muted text-muted-foreground" },
      unknown: { label: "Pending", tone: "bg-muted text-muted-foreground" },
    }),
    []
  );

  const pendingCount = contextFiles.filter((ctx) => ["uploading", "indexing", "unknown"].includes(ctx.status)).length;
  const visibleFiles = useMemo(
    () => contextFiles.filter((ctx) => ctx.status !== "deleted"),
    [contextFiles]
  );

  const handleFileUpload = (file: File) => {
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/markdown',
      'text/plain',
      'application/json',
      'text/csv'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Please upload PDF, DOCX, Markdown, TXT, JSON, or CSV files.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload files smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
    if (mimeType.includes("word") || mimeType.includes("document")) return <FileText className="w-4 h-4 text-blue-500" />;
    if (mimeType.includes("text") || mimeType.includes("markdown")) return <FileText className="w-4 h-4 text-green-500" />;
    if (mimeType.includes("json")) return <File className="w-4 h-4 text-yellow-500" />;
    return <File className="w-4 h-4 text-gray-500" />;
  };

  if (isLoading || loadingProject || !isAuthenticated || !projectId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-foreground">Loading context files...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-auto p-6" data-testid="context-files-main">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Context Files</h1>
          <p className="text-muted-foreground">Upload and manage project context files for AI generation</p>
        </div>

        {/* Upload Area */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Upload className="w-5 h-5" />
              <span>Upload Files</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/60"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              data-testid="file-upload-area"
            >
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-semibold mb-1">Drop files here or click to upload</p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports PDF, DOCX, Markdown, TXT, JSON, and CSV files (max 10MB)
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={uploadMutation.isPending}
                className="px-6"
                data-testid="button-upload"
              >
                {uploadMutation.isPending ? "Uploading..." : "Select file"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.doc,.md,.txt,.json,.csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                    e.target.value = "";
                  }
                }}
                data-testid="file-input"
              />
            </div>
            {pendingCount > 0 && (
              <p className="mt-3 text-sm text-muted-foreground flex items-center justify-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Indexing {pendingCount} file{pendingCount > 1 ? "s" : ""} with OpenAI...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Files List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Folder className="w-5 h-5" />
              <span>Uploaded Files</span>
              {visibleFiles.length > 0 && (
                <Badge variant="secondary">{visibleFiles.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2">Loading files...</span>
              </div>
            ) : visibleFiles.length === 0 ? (
              <div className="text-center py-8">
                <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">No files uploaded yet</p>
                <p className="text-muted-foreground">
                  Upload your first context file to get started with AI generation.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleFiles.map((file: ContextFile) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`file-item-${file.id}`}
                  >
                    <div className="flex items-start space-x-3">
                      {getFileIcon(file.mimeType)}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{file.fileName}</p>
                          <Badge className={statusMeta[file.status]?.tone ?? "bg-muted text-muted-foreground"}>
                            {statusMeta[file.status]?.label ?? file.status}
                          </Badge>
                          {file.provider && (
                            <Badge variant="outline" className="text-xs">
                              {file.provider === "openai" ? "OpenAI" : file.provider}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{formatFileSize(file.fileSize)}</span>
                          <span>•</span>
                          <span>Uploaded {new Date(file.createdAt).toLocaleString()}</span>
                          {file.chunkCount ? (
                            <>
                              <span>•</span>
                              <span>{file.chunkCount} chunks</span>
                            </>
                          ) : null}
                          {file.openaiFileId && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1 text-xs">
                                <Info className="w-3 h-3" />
                                <code className="font-mono">{file.openaiFileId}</code>
                              </span>
                            </>
                          )}
                        </div>
                        {file.lastError && (
                          <p className="flex items-center gap-2 text-xs text-destructive/80">
                            <AlertTriangle className="w-3 h-3" />
                            {file.lastError}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {file.status === "indexing" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStatusRefresh(file.id)}
                          disabled={isFetching}
                          data-testid={`button-refresh-${file.id}`}
                        >
                          Refresh
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleStatusRefresh(file.id)}
                            disabled={file.status === "deleted"}
                          >
                            Refresh status
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => deleteMutation.mutate(file.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
