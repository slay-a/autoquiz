import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { ThemeProvider, THEME_STORAGE_KEY } from "../contexts/ThemeContext";

// Supabase is called during AuthProvider init — stub it out so App mounts.
vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

function installMatchMedia(prefersDark = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: prefersDark,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("App integration — FEAT-012 theme application", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  // AC-12.1.4: integration test required by spec §7.
  it("AC-12.1.4: with aq_theme='dark' in localStorage, <html> gains class 'dark' after mount", async () => {
    installMatchMedia(false);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <App />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  // AC-12.1.4 light path
  it("AC-12.1.4: with aq_theme='light' in localStorage, <html> does NOT carry the 'dark' class", async () => {
    installMatchMedia(true); // OS prefers dark
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <App />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  // Design-validator anchor: FEAT-001 routing is unaffected — unauth'd root goes to /login.
  it("FEAT-001 regression: unauthenticated root render shows Login UI (no routing regression)", async () => {
    installMatchMedia(false);

    const { findByRole } = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </ThemeProvider>
    );

    // Login page renders a 'Sign In' submit button — if routing is broken,
    // this wouldn't appear.
    expect(await findByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
