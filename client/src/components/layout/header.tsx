import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/theme-toggle";
import { Bell, Sparkles } from "lucide-react";

interface HeaderProps {
  title: string;
  description: string;
}

export default function Header({ title, description }: HeaderProps) {
  const handleNewGeneration = () => {
    // TODO: Implement new generation modal
    console.log("Starting new generation...");
  };

  return (
    <header className="bg-card border-b border-border px-6 py-4" data-testid="header">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" data-testid="header-title">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground" data-testid="header-description">
            {description}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Theme Toggle */}
          <ThemeToggle />
          
          {/* Notifications */}
          <button 
            className="p-2 hover:bg-muted rounded-md relative transition-colors"
            data-testid="notifications-button"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full text-xs flex items-center justify-center text-destructive-foreground">
              3
            </span>
          </button>
          
          {/* New Generation Button */}
          <Button 
            onClick={handleNewGeneration}
            className="flex items-center space-x-2"
            data-testid="button-new-generation"
          >
            <Sparkles className="w-4 h-4" />
            <span>New Generation</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
