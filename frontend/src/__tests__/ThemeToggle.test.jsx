import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeToggle from "../components/ThemeToggle";
import { ThemeProvider, THEME_STORAGE_KEY } from "../contexts/ThemeContext";

// Minimal matchMedia mock so ThemeProvider can mount.
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

function renderWithTheme(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("ThemeToggle (FEAT-012 Story 12.1)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    installMatchMedia(false);
  });

  // AC-12.1.1 (icon selection)
  it("AC-12.1.1: renders a moon icon in light mode (icon of theme that will be activated)", () => {
    renderWithTheme(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: /toggle theme/i });
    expect(btn).toHaveAttribute("data-theme", "light");
    // Lucide's moon icon renders with class 'lucide-moon'
    expect(btn.querySelector("svg.lucide-moon")).not.toBeNull();
    expect(btn.querySelector("svg.lucide-sun")).toBeNull();
  });

  it("AC-12.1.1: renders a sun icon in dark mode", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderWithTheme(<ThemeToggle />);

    const btn = screen.getByRole("button", { name: /toggle theme/i });
    expect(btn).toHaveAttribute("data-theme", "dark");
    expect(btn.querySelector("svg.lucide-sun")).not.toBeNull();
    expect(btn.querySelector("svg.lucide-moon")).toBeNull();
  });

  // AC-12.1.1 (accessible label)
  it("AC-12.1.1: exposes an accessible label 'Toggle theme'", () => {
    renderWithTheme(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: /toggle theme/i })
    ).toBeInTheDocument();
  });

  // AC-12.1.2 + AC-12.1.3 via click
  it("AC-12.1.2 / AC-12.1.3: clicking the toggle flips <html>.classList and writes localStorage", async () => {
    const user = userEvent.setup();
    renderWithTheme(<ThemeToggle />);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    await user.click(screen.getByRole("button", { name: /toggle theme/i }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await user.click(screen.getByRole("button", { name: /toggle theme/i }));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("reflects current theme via aria-pressed", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    renderWithTheme(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: /toggle theme/i })
    ).toHaveAttribute("aria-pressed", "true");
  });
});
