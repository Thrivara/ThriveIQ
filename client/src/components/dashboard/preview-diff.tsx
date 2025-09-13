import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Info, Maximize2 } from "lucide-react";

const mockGeneratedItems = [
  {
    id: "PROJ-123",
    title: "User Authentication and Authorization System",
    type: "Epic",
    status: "Enhanced",
    changes: {
      title: {
        before: "User login functionality",
        after: "User Authentication and Authorization System",
      },
      description: {
        before: "Basic user login with username and password",
        after: "Implement comprehensive authentication system supporting Google SSO, Azure AD, and multi-tenant workspace management with role-based access control. The system should handle user registration, authentication, authorization, and session management across different identity providers while maintaining security best practices.",
      },
      acceptanceCriteria: {
        before: "",
        after: "GIVEN a user wants to sign in\nWHEN they select Google or Azure AD SSO\nTHEN they should be redirected to the appropriate identity provider\nAND upon successful authentication, be redirected back to the application\nAND have their session established with correct permissions",
      },
    },
  },
  {
    id: "PROJ-124",
    title: "Jira Integration with OAuth 2.0",
    type: "Feature",
    status: "New Tasks Added",
    changes: {
      newTasks: [
        "Task: Set up Jira OAuth application",
        "Task: Implement OAuth callback handling",
        "Task: Create Jira API client wrapper",
        "Task: Implement work item sync functionality",
        "Task: Add error handling and rate limiting",
      ],
    },
  },
];

export default function PreviewDiff() {
  const [selectedItems, setSelectedItems] = useState<string[]>(["PROJ-123", "PROJ-124"]);
  const [activeTab, setActiveTab] = useState<"before" | "after">("after");

  const handleItemSelect = (itemId: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, itemId]);
    } else {
      setSelectedItems(selectedItems.filter(id => id !== itemId));
    }
  };

  const handleApplyChanges = () => {
    console.log("Applying changes for items:", selectedItems);
  };

  const handleDiscardChanges = () => {
    console.log("Discarding changes");
  };

  return (
    <Card data-testid="preview-diff">
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Generation Results</CardTitle>
            <p className="text-sm text-muted-foreground">Review changes before applying to your tracker</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="secondary" 
              onClick={handleDiscardChanges}
              data-testid="button-discard-changes"
            >
              Discard Changes
            </Button>
            <Button 
              onClick={handleApplyChanges}
              data-testid="button-apply-changes"
            >
              Apply Selected Changes
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {/* Generation Summary */}
        <div className="bg-muted/50 p-4 rounded-lg mb-6">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h4 className="font-medium text-sm mb-1">Generation Summary</h4>
              <p className="text-sm text-muted-foreground">
                Generated using <strong>Agile Story Template</strong> with OpenAI GPT-5. Applied project context from 3 uploaded documents. 2 items processed successfully.
              </p>
              <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                <span>Template: Agile Story (v2.1)</span>
                <span>Model: GPT-5</span>
                <span>Duration: 45s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Diff Viewer */}
        <div className="space-y-6">
          {mockGeneratedItems.map((item) => (
            <div key={item.id} className="border border-border rounded-lg" data-testid={`diff-item-${item.id}`}>
              <div className="p-4 border-b border-border bg-muted/25">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      checked={selectedItems.includes(item.id)}
                      onCheckedChange={(checked) => handleItemSelect(item.id, !!checked)}
                      data-testid={`checkbox-diff-${item.id}`}
                    />
                    <div>
                      <h4 className="font-medium text-sm">{item.title}</h4>
                      <p className="text-xs text-muted-foreground">{item.id} • {item.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className="text-xs bg-chart-2/10 text-chart-2">{item.status}</Badge>
                    <button className="p-1 hover:bg-muted rounded" data-testid={`expand-${item.id}`}>
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4">
                {/* Before/After Toggle */}
                <div className="flex items-center space-x-1 mb-4">
                  <button
                    onClick={() => setActiveTab("before")}
                    className={`px-3 py-1 text-xs font-medium rounded-l-md ${
                      activeTab === "before"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                    data-testid="tab-before"
                  >
                    Before
                  </button>
                  <button
                    onClick={() => setActiveTab("after")}
                    className={`px-3 py-1 text-xs font-medium rounded-r-md ${
                      activeTab === "after"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                    data-testid="tab-after"
                  >
                    After
                  </button>
                </div>

                {/* Diff Content */}
                <div className="space-y-4">
                  {item.changes.title && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Title</h5>
                      <div className="font-mono text-xs space-y-1">
                        <div className="diff-removed p-2 rounded">
                          - {item.changes.title.before}
                        </div>
                        <div className="diff-added p-2 rounded">
                          + {item.changes.title.after}
                        </div>
                      </div>
                    </div>
                  )}

                  {item.changes.description && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Description</h5>
                      <div className="font-mono text-xs space-y-1">
                        <div className="diff-removed p-2 rounded">
                          - {item.changes.description.before}
                        </div>
                        <div className="diff-added p-2 rounded">
                          + {item.changes.description.after}
                        </div>
                      </div>
                    </div>
                  )}

                  {item.changes.acceptanceCriteria && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Acceptance Criteria</h5>
                      <div className="font-mono text-xs space-y-1">
                        <div className="diff-added p-2 rounded">
                          + {item.changes.acceptanceCriteria.after}
                        </div>
                      </div>
                    </div>
                  )}

                  {item.changes.newTasks && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">New Sub-tasks Generated</h5>
                      <div className="font-mono text-xs space-y-1">
                        {item.changes.newTasks.map((task, index) => (
                          <div key={index} className="diff-added p-2 rounded">
                            + {task}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
