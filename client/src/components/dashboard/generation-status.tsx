import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

const recentGenerations = [
  {
    template: "Agile Story Template",
    timestamp: "2 hours ago",
    itemCount: 5,
  },
  {
    template: "Bug Fix Rewrite",
    timestamp: "Yesterday",
    itemCount: 2,
  },
];

export default function GenerationStatus() {
  return (
    <Card data-testid="generation-status">
      <CardHeader>
        <CardTitle>Generation Status</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Active Generation */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-chart-2 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">Running Generation</span>
            </div>
            <span className="text-xs text-muted-foreground" data-testid="progress-count">
              2/3
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: "67%" }}
              data-testid="progress-bar"
            ></div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p data-testid="current-step">
              Processing: "User Authentication and Authorization System"
            </p>
            <p className="text-xs mt-1" data-testid="eta">
              Estimated completion: ~30 seconds
            </p>
          </div>
        </div>

        {/* Recent Generations */}
        <div className="mt-6">
          <h4 className="text-sm font-medium mb-3">Recent Generations</h4>
          <div className="space-y-2">
            {recentGenerations.map((gen, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                data-testid={`recent-generation-${index}`}
              >
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-chart-2" />
                  <div>
                    <p className="text-xs font-medium">{gen.template}</p>
                    <p className="text-xs text-muted-foreground">{gen.timestamp}</p>
                  </div>
                </div>
                <span className="text-xs bg-chart-2/10 text-chart-2 px-2 py-1 rounded-full">
                  {gen.itemCount} items
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
