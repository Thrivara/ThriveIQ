import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

const storageKey = "theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  const applyTheme = useCallback((value: "light" | "dark") => {
    const root = document.documentElement;

    if (value === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey) as "light" | "dark" | null;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const initial = saved ?? (media.matches ? "dark" : "light");

    setTheme(initial);
    applyTheme(initial);

    const listener = (event: MediaQueryListEvent) => {
      // Respect system changes only when user hasn't chosen a preference yet
      if (localStorage.getItem(storageKey)) return;
      const nextTheme = event.matches ? "dark" : "light";
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };

    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [applyTheme]);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    localStorage.setItem(storageKey, nextTheme);
  };

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="p-2"
      data-testid="theme-toggle"
      aria-pressed={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </Button>
  );
}
