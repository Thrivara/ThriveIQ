import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle } from "lucide-react";

const integrations = [
  {
    name: "Jira Cloud",
    status: "connected",
    icon: CheckCircle,
    color: "text-chart-2",
  },
  {
    name: "Azure DevOps",
    status: "connected",
    icon: CheckCircle,
    color: "text-chart-2",
  },
  {
    name: "Confluence",
    status: "setup-required",
    icon: AlertCircle,
    color: "text-amber-500",
  },
];

export default function IntegrationStatus() {
  const handleSetupIntegration = () => {
    console.log("Setting up integration...");
    // TODO: Implement integration setup
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-chart-2/10 text-chart-2";
      case "setup-required":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-secondary/10 text-secondary-foreground";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "connected":
        return "Connected";
      case "setup-required":
        return "Setup Required";
      default:
        return "Unknown";
    }
  };

  return (
    <Card data-testid="integration-status">
      <CardHeader>
        <CardTitle>Integration Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {integrations.map((integration, index) => (
            <div
              key={index}
              className="flex items-center justify-between"
              data-testid={`integration-${integration.name.toLowerCase().replace(" ", "-")}`}
            >
              <div className="flex items-center space-x-2">
                <integration.icon className={`w-4 h-4 ${integration.color}`} />
                <span className="text-sm font-medium">{integration.name}</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${getStatusBadge(integration.status)}`}>
                {getStatusText(integration.status)}
              </span>
            </div>
          ))}
          
          <Button
            onClick={handleSetupIntegration}
            variant="secondary"
            className="w-full mt-3"
            data-testid="button-setup-integration"
          >
            Setup Integration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
