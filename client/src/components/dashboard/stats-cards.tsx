import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Sparkles, RefreshCw, FileText } from "lucide-react";

const stats = [
  {
    title: "Total Work Items",
    value: "247",
    change: "+12 from last week",
    icon: ClipboardList,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    title: "AI Generations",
    value: "89",
    change: "+8 from last week",
    icon: Sparkles,
    color: "text-chart-1",
    bgColor: "bg-chart-1/10",
  },
  {
    title: "Synced Items",
    value: "156",
    change: "+24 from last week",
    icon: RefreshCw,
    color: "text-chart-2",
    bgColor: "bg-chart-2/10",
  },
  {
    title: "Active Templates",
    value: "12",
    change: "+2 from last week",
    icon: FileText,
    color: "text-chart-3",
    bgColor: "bg-chart-3/10",
  },
];

export default function StatsCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="stats-cards">
      {stats.map((stat, index) => (
        <Card key={index} data-testid={`stat-card-${index}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </p>
                <p className="text-2xl font-bold" data-testid={`stat-value-${index}`}>
                  {stat.value}
                </p>
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${stat.bgColor}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{stat.change}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
