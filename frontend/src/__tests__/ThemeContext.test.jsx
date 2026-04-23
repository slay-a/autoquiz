import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { ThemeProvider, useTheme, THEME_STORAGE_KEY } from "../contexts/ThemeContext";

// ---------- Shared matchMedia mock helper ----------
function mockMatchMedia({ prefersDark = false } = {}) {
  const listeners = new Set();
  const mq = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_ev, cb) => listeners.add(cb),
    removeEventListener: (_ev, cb) => listeners.delete(cb),
    addListener: (cb) => listeners.add(cb), // legacy
    removeListener: (cb) => listeners.delete(cb),
    dispatchEvent: () => true,
    __fireChange(matches) {
      mq.matches = matches;
      listeners.forEach((cb) => cb({ matches }));
    },
  };
  const fn = vi.fn().mockImplementation(() => mq);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: fn,
  });
  return mq;
}

function wrapper({ children }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe("ThemeContext (FEAT-012 Story 12.1)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  // AC-12.1.4
  it("AC-12.1.4: reads aq_theme='dark' from localStorage on mount and applies .dark", () => {
    mockMatchMedia({ prefersDark: false });
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("AC-12.1.4: reads aq_theme='light' from localStorage on mount and does NOT apply .dark", () => {
    mockMatchMedia({ prefersDark: true }); // OS prefers dark, but explicit light wins
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // AC-12.1.4 fallback
  it("AC-12.1.4: falls back to OS prefers-color-scheme:dark when aq_theme is absent", () => {
    mockMatchMedia({ prefersDark: true });

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("AC-12.1.4: falls back to OS prefers-color-scheme:light when aq_theme absent and OS is light", () => {
    mockMatchMedia({ prefersDark: false });

    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // AC-12.1.2 + AC-12.1.3
  it("AC-12.1.2 / AC-12.1.3: toggleTheme flips theme, updates <html> class, and writes localStorage synchronously", () => {
    mockMatchMedia({ prefersDark: false });

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("AC-12.1.3: setTheme('dark') writes 'dark' to localStorage synchronously", () => {
    mockMatchMedia({ prefersDark: false });

    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.setTheme("dark"));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // AC-12.1.5
  it("AC-12.1.5: updates live to OS change while aq_theme is absent", () => {
    const mq = mockMatchMedia({ prefersDark: false });

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");

    act(() => mq.__fireChange(true));

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("AC-12.1.5: ignores OS change once user has explicitly toggled (aq_theme set)", () => {
    const mq = mockMatchMedia({ prefersDark: false });

    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.toggleTheme()); // user sets dark explicitly
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    // OS now flips to light — should be ignored
    act(() => mq.__fireChange(false));

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // AC-12.1.8
  it("AC-12.1.8: syncs across tabs via window 'storage' events", () => {
    mockMatchMedia({ prefersDark: false });

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: "dark",
          oldValue: null,
        })
      );
    });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: THEME_STORAGE_KEY,
          newValue: "light",
          oldValue: "dark",
        })
      );
    });

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("AC-12.1.8: ignores storage events for unrelated keys", () => {
    mockMatchMedia({ prefersDark: false });

    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "aq_profile",
          newValue: JSON.stringify({ id: "x" }),
          oldValue: null,
        })
      );
    });

    expect(result.current.theme).toBe("light");
  });

  it("useTheme throws when used outside <ThemeProvider>", () => {
    // Swallow React's error boundary log noise.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
    errSpy.mockRestore();
  });

  // Not testable in happy-dom — see spec §7:
  // The pre-paint inline <script> in frontend/index.html runs before React
  // mounts in a real browser. happy-dom doesn't execute <script> tags the
  // same way, so we verify this manually in the browser during review.
  it.skip("AC-12.1.4: inline pre-paint script applies theme before first paint (manual/browser only)", () => {});

  // Not testable in this stack — see spec §7:
  // AC-12.1.7 requires WCAG 2.1 AA contrast ratios (≥4.5:1 body, ≥3:1 large
  // text). Actual colour-contrast measurement is a design/review concern and
  // cannot be automated in happy-dom. Verified manually against the slate
  // palette (slate-900 bg / slate-100 text ≈ 17:1; slate-800 bg / slate-300
  // text ≈ 9:1) during code review.
  it.skip("AC-12.1.7: dark-mode text meets WCAG 2.1 AA contrast (manual/review only)", () => {});
});
