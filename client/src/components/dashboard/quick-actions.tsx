import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FilePlus, Settings } from "lucide-react";

const actions = [
  {
    title: "Upload Context",
    description: "Add project documents",
    icon: Upload,
    color: "text-chart-1",
    bgColor: "bg-chart-1/10",
    action: "uploadContext",
  },
  {
    title: "Create Template",
    description: "New generation template",
    icon: FilePlus,
    color: "text-chart-2",
    bgColor: "bg-chart-2/10",
    action: "createTemplate",
  },
  {
    title: "Manage Integrations",
    description: "Jira, Azure DevOps",
    icon: Settings,
    color: "text-chart-3",
    bgColor: "bg-chart-3/10",
    action: "manageIntegrations",
  },
];

export default function QuickActions() {
  const handleAction = (action: string) => {
    console.log(`Quick action: ${action}`);
    // TODO: Implement actual actions
  };

  return (
    <Card data-testid="quick-actions">
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => handleAction(action.action)}
              className="w-full flex items-center space-x-3 p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors text-left"
              data-testid={`quick-action-${action.action}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${action.bgColor}`}>
                <action.icon className={`w-4 h-4 ${action.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium">{action.title}</p>
                <p className="text-xs text-muted-foreground">{action.description}</p>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
