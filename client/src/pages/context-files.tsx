import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Folder, Upload, FileText, File, Trash2, Download, Eye } from "lucide-react";

// Mock project ID for now - will be replaced with proper workspace context
const MOCK_PROJECT_ID = "550e8400-e29b-41d4-a716-446655440000";

interface ContextFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  metadata: {
    originalName: string;
    uploadedAt: string;
    hasTextContent: boolean;
  };
  createdAt: string;
}

export default function ContextFiles() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [dragActive, setDragActive] = useState(false);
  const queryClient = useQueryClient();

  // Fetch context files
  const { data: contextFiles = [], isLoading: filesLoading, refetch } = useQuery<ContextFile[]>({
    queryKey: ['/api/projects', MOCK_PROJECT_ID, 'contexts'],
    enabled: isAuthenticated && !isLoading,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/projects/${MOCK_PROJECT_ID}/contexts/upload`, {
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
        description: "Your file has been processed and is ready for AI generation.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', MOCK_PROJECT_ID, 'contexts'] });
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
        window.location.href = "/api/login";
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
    if (mimeType.includes('pdf')) return <FileText className="w-4 h-4 text-red-500" />;
    if (mimeType.includes('word') || mimeType.includes('document')) return <FileText className="w-4 h-4 text-blue-500" />;
    if (mimeType.includes('text') || mimeType.includes('markdown')) return <FileText className="w-4 h-4 text-green-500" />;
    if (mimeType.includes('json')) return <File className="w-4 h-4 text-yellow-500" />;
    return <File className="w-4 h-4 text-gray-500" />;
  };

  if (isLoading || !isAuthenticated) {
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
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              data-testid="file-upload-area"
            >
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">Drop files here or click to upload</p>
              <p className="text-muted-foreground mb-4">
                Supports PDF, DOCX, Markdown, TXT, JSON, and CSV files (max 10MB)
              </p>
              <input
                type="file"
                className="hidden"
                id="file-input"
                accept=".pdf,.docx,.doc,.md,.txt,.json,.csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
                data-testid="file-input"
              />
              <Button 
                onClick={() => document.getElementById('file-input')?.click()}
                disabled={uploadMutation.isPending}
                data-testid="button-upload"
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Choose Files'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Files List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Folder className="w-5 h-5" />
              <span>Uploaded Files</span>
              {contextFiles.length > 0 && (
                <Badge variant="secondary">{contextFiles.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2">Loading files...</span>
              </div>
            ) : contextFiles.length === 0 ? (
              <div className="text-center py-8">
                <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">No files uploaded yet</p>
                <p className="text-muted-foreground">
                  Upload your first context file to get started with AI generation.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {contextFiles.map((file: ContextFile) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    data-testid={`file-item-${file.id}`}
                  >
                    <div className="flex items-center space-x-3">
                      {getFileIcon(file.mimeType)}
                      <div>
                        <p className="font-medium">{file.fileName}</p>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <span>{formatFileSize(file.fileSize)}</span>
                          <span>•</span>
                          <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                          {file.metadata.hasTextContent && (
                            <>
                              <span>•</span>
                              <Badge variant="outline" className="text-xs">
                                Text Extracted
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="sm" data-testid={`button-view-${file.id}`}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" data-testid={`button-download-${file.id}`}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" data-testid={`button-delete-${file.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
