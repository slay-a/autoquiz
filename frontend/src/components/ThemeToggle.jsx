import { Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

/**
 * FEAT-012 AC-12.1.1 / AC-12.1.2:
 * Renders a button that flips the theme. Icon shows the theme that will
 * be activated on click:
 *   - Moon icon when currently in light mode (click → dark).
 *   - Sun icon when currently in dark mode (click → light).
 *
 * Accessible via aria-label="Toggle theme". The button is keyboard-
 * focusable and uses ring styles for focus visibility in both themes.
 */
export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      aria-pressed={isDark}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-theme={theme}
      className={
        "inline-flex items-center justify-center w-9 h-9 rounded-lg " +
        "text-gray-600 hover:bg-gray-100 hover:text-gray-900 " +
        "dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 " +
        "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 " +
        className
      }
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}
