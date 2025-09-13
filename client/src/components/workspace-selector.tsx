import { ChevronDown } from "lucide-react";

// Mock workspace data
const mockWorkspace = {
  name: "Thrivara Consulting",
  project: "Project Alpha",
  avatar: "TC",
};

export default function WorkspaceSelector() {
  const handleWorkspaceSelect = () => {
    console.log("Opening workspace selector...");
    // TODO: Implement workspace selection modal
  };

  return (
    <div className="flex items-center justify-between" data-testid="workspace-selector">
      <div className="flex items-center space-x-2">
        <div className="w-6 h-6 bg-secondary rounded flex items-center justify-center">
          <span className="text-xs font-medium">{mockWorkspace.avatar}</span>
        </div>
        <div>
          <p className="text-sm font-medium" data-testid="workspace-name">
            {mockWorkspace.name}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="project-name">
            {mockWorkspace.project}
          </p>
        </div>
      </div>
      <button 
        onClick={handleWorkspaceSelect}
        className="p-1 hover:bg-muted rounded"
        data-testid="workspace-selector-button"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  );
}
