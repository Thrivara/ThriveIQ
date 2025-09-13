import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, RefreshCw, ChevronDown } from "lucide-react";

// Mock work items data structure
const mockWorkItems = [
  {
    id: "PROJ-123",
    type: "Epic",
    title: "User Authentication and Authorization System",
    description: "Implement comprehensive authentication system supporting Google SSO, Azure AD, and multi-tenant workspace management with role-based access control...",
    status: "In Progress",
    priority: "High",
    assignee: "John Doe",
    lastUpdated: "2 days ago",
  },
  {
    id: "PROJ-124",
    type: "Feature",
    title: "Jira Integration with OAuth 2.0",
    description: "Enable seamless integration with Jira Cloud using OAuth 2.0 for secure authentication and work item synchronization...",
    status: "To Do",
    priority: "Medium",
    assignee: "Sarah Chen",
    lastUpdated: "1 day ago",
  },
  {
    id: "PROJ-125",
    type: "User Story",
    title: "Upload Context Files for AI Generation",
    description: "As a project contributor, I want to upload context files (DOCX, PDF, MD, etc.) so that the AI can generate more accurate and contextually relevant backlog items...",
    status: "In Progress",
    priority: "High",
    assignee: "Mike Johnson",
    lastUpdated: "3 hours ago",
  },
];

const getTypeColor = (type: string) => {
  switch (type) {
    case "Epic":
      return "bg-primary/10 text-primary";
    case "Feature":
      return "bg-chart-1/10 text-chart-1";
    case "User Story":
      return "bg-chart-4/10 text-chart-4";
    default:
      return "bg-secondary/10 text-secondary-foreground";
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "In Progress":
      return "bg-chart-2/10 text-chart-2";
    case "To Do":
      return "bg-chart-3/10 text-chart-3";
    case "Done":
      return "bg-green-100 text-green-700";
    default:
      return "bg-secondary/10 text-secondary-foreground";
  }
};

export default function WorkItemsBrowser() {
  const [selectedItems, setSelectedItems] = useState<string[]>(["PROJ-123", "PROJ-124", "PROJ-125"]);
  const [selectAll, setSelectAll] = useState(false);

  const handleItemSelect = (itemId: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, itemId]);
    } else {
      setSelectedItems(selectedItems.filter(id => id !== itemId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedItems(mockWorkItems.map(item => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleGenerateSelected = () => {
    console.log("Generating for items:", selectedItems);
  };

  return (
    <Card data-testid="work-items-browser">
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Work Items Browser</CardTitle>
            <p className="text-sm text-muted-foreground">Select items to generate or rewrite</p>
          </div>
          <div className="flex items-center space-x-2">
            <Select defaultValue="all-types" data-testid="type-filter">
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-types">All Types</SelectItem>
                <SelectItem value="epic">Epic</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="user-story">User Story</SelectItem>
                <SelectItem value="task">Task</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" size="sm" data-testid="button-filter">
              <Filter className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="sm" data-testid="button-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {/* Filter Bar */}
        <div className="flex items-center space-x-4 mb-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="select-all"
              checked={selectAll}
              onCheckedChange={handleSelectAll}
              data-testid="checkbox-select-all"
            />
            <label htmlFor="select-all" className="text-sm font-medium">
              Select All
            </label>
          </div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span data-testid="selected-count">{selectedItems.length} selected</span>
            <span>•</span>
            <span data-testid="total-count">{mockWorkItems.length} total</span>
          </div>
          <div className="flex-1"></div>
          <Button
            onClick={handleGenerateSelected}
            disabled={selectedItems.length === 0}
            data-testid="button-generate-selected"
          >
            Generate Selected
          </Button>
        </div>

        {/* Work Items List */}
        <div className="space-y-3">
          {mockWorkItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start space-x-3 p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
              data-testid={`work-item-${item.id}`}
            >
              <Checkbox
                checked={selectedItems.includes(item.id)}
                onCheckedChange={(checked) => handleItemSelect(item.id, !!checked)}
                className="mt-1"
                data-testid={`checkbox-${item.id}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-2">
                  <Badge className={`text-xs font-medium ${getTypeColor(item.type)}`}>
                    {item.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{item.id}</span>
                  <Badge className={`text-xs font-medium ${getStatusColor(item.status)}`}>
                    {item.status}
                  </Badge>
                </div>
                <h4 className="font-medium text-sm mb-1" data-testid={`item-title-${item.id}`}>
                  {item.title}
                </h4>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {item.description}
                </p>
                <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                  <span>Assigned to: {item.assignee}</span>
                  <span>Updated: {item.lastUpdated}</span>
                  <span>Priority: {item.priority}</span>
                </div>
              </div>
            </div>
          ))}

          {/* Load More Button */}
          <button 
            className="w-full p-3 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            data-testid="button-load-more"
          >
            <ChevronDown className="w-4 h-4 inline mr-2" />
            Load more items
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
