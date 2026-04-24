import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * FEAT-012 Theme Preferences — ThemeContext.
 *
 * Exposes { theme, setTheme, toggleTheme } where `theme` is "light" or "dark".
 *
 * Rules (AC-12.1.1 through AC-12.1.8):
 *   - Reads `aq_theme` from localStorage on mount; if absent, falls back to
 *     the OS `prefers-color-scheme: dark` media query.
 *   - Toggling or calling setTheme with an explicit value writes `aq_theme`
 *     to localStorage synchronously, and applies/removes the `dark` class
 *     on <html>.
 *   - Subscribes to `prefers-color-scheme` changes — only follows the OS
 *     while `aq_theme` is absent. Once the user has explicitly set a theme,
 *     the OS preference is ignored for the rest of the session.
 *   - Subscribes to `storage` events on `window` for cross-tab sync: when
 *     another tab writes `aq_theme`, this tab's theme updates to match.
 *
 * Device-scoped, not user-scoped. No network calls, no DB.
 */

export const THEME_STORAGE_KEY = "aq_theme";

const ThemeContext = createContext(null);

function isValidTheme(v) {
  return v === "light" || v === "dark";
}

function readStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(v) ? v : null;
  } catch {
    return null;
  }
}

function osPrefersDark() {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  } catch {
    return false;
  }
}

function applyThemeClass(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

function initialTheme() {
  const stored = readStoredTheme();
  if (stored) return stored;
  return osPrefersDark() ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => initialTheme());

  // Keep <html> class in sync on every theme change (AC-12.1.2).
  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  // AC-12.1.3 / AC-12.1.2: explicit setter. Writes synchronously to
  // localStorage so subsequent reads (or other tabs) see the new value.
  const setTheme = useCallback((next) => {
    if (!isValidTheme(next)) return;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable — still update in-memory theme */
    }
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* localStorage unavailable */
      }
      return next;
    });
  }, []);

  // AC-12.1.5: OS preference is only followed while aq_theme is absent.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => {
      // Re-check storage each time — user might have set an explicit
      // preference since mount.
      if (readStoredTheme() !== null) return;
      setThemeState(e.matches ? "dark" : "light");
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    // Legacy Safari fallback
    if (typeof mq.addListener === "function") {
      mq.addListener(handler);
      return () => mq.removeListener(handler);
    }
    return undefined;
  }, []);

  // AC-12.1.8: cross-tab sync via `storage` events.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = (e) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      if (isValidTheme(e.newValue)) {
        setThemeState(e.newValue);
      } else if (e.newValue === null) {
        // The other tab cleared the preference — revert to OS fallback.
        setThemeState(osPrefersDark() ? "dark" : "light");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside a <ThemeProvider>");
  }
  return ctx;
}
