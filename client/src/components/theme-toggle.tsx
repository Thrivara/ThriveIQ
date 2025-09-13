import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    // Check for saved theme preference or default to 'dark' mode
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const initialTheme = savedTheme || systemTheme;
    
    setTheme(initialTheme);
    updateTheme(initialTheme);
  }, []);

  const updateTheme = (newTheme: "light" | "dark") => {
    const html = document.documentElement;
    if (newTheme === "light") {
      html.setAttribute("data-theme", "light");
    } else {
      html.removeAttribute("data-theme");
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    updateTheme(newTheme);
    localStorage.setItem("theme", newTheme);
  };

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={toggleTheme}
      className="p-2"
      data-testid="theme-toggle"
    >
      {theme === "light" ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </Button>
  );
}
