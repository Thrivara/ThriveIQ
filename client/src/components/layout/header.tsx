import { useState } from "react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/theme-toggle";
import { requestSignOut } from "@/lib/authUtils";
import { Bell, LogOut, Sparkles } from "lucide-react";

interface HeaderProps {
  title: string;
  description: string;
}

export default function Header({ title, description }: HeaderProps) {
  const handleNewGeneration = () => {
    // TODO: Implement new generation modal
    console.log("Starting new generation...");
  };

  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    try {
      setIsSigningOut(true);
      await requestSignOut();
      window.location.href = "/login";
    } catch (error) {
      console.error("Failed to sign out", error);
      setIsSigningOut(false);
    }
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

          {/* Sign Out */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="px-2"
            data-testid="button-header-sign-out"
            disabled={isSigningOut}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{isSigningOut ? "Signing out" : "Sign out"}</span>
          </Button>

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
