import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TopBar from "../components/TopBar";
import { ThemeProvider } from "../contexts/ThemeContext";

// Mock the AuthContext so we can flip between authed/unauthed
const mockUseAuth = vi.fn();
vi.mock("../contexts/AuthContext", async () => {
  const actual = await vi.importActual("../contexts/AuthContext");
  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

// supabase is imported transitively via AuthContext
vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn().mockResolvedValue({}),
    },
  },
}));

function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
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

function renderTopBar({ children } = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <TopBar>{children}</TopBar>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe("TopBar (FEAT-012 Story 12.1)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    installMatchMedia();
    mockUseAuth.mockReset();
  });

  // AC-12.1.1: toggle always present
  it("AC-12.1.1: renders <ThemeToggle /> when unauthenticated (login/register context)", () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null, logout: vi.fn() });
    renderTopBar();

    expect(
      screen.getByRole("button", { name: /toggle theme/i })
    ).toBeInTheDocument();
  });

  it("AC-12.1.1: renders <ThemeToggle /> when authenticated", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1" },
      profile: { id: "u1", full_name: "Alice", role: "student" },
      logout: vi.fn(),
    });
    renderTopBar();

    expect(
      screen.getByRole("button", { name: /toggle theme/i })
    ).toBeInTheDocument();
  });

  it("renders AutoQuiz brand logo on every page", () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null, logout: vi.fn() });
    renderTopBar();
    expect(screen.getByText(/AutoQuiz/i)).toBeInTheDocument();
  });

  it("shows role-based nav links only when authenticated (student)", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1" },
      profile: { id: "u1", full_name: "Alice", role: "student" },
      logout: vi.fn(),
    });
    renderTopBar();

    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /generate/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /notes/i })).toBeInTheDocument();
  });

  it("shows instructor dashboard link when role=instructor", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1" },
      profile: { id: "u1", full_name: "Bob", role: "instructor" },
      logout: vi.fn(),
    });
    renderTopBar();

    const link = screen.getByRole("link", { name: /dashboard/i });
    expect(link).toHaveAttribute("href", "/instructor");
    // Student-only links must not render
    expect(screen.queryByRole("link", { name: /generate/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /notes/i })).toBeNull();
  });

  it("hides nav links and logout when unauthenticated", () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null, logout: vi.fn() });
    renderTopBar();

    expect(screen.queryByRole("link", { name: /dashboard/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /log out/i })).toBeNull();
  });

  // Children slot
  it("renders children in the action slot", () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null, logout: vi.fn() });
    renderTopBar({
      children: <button data-testid="page-action">Action</button>,
    });

    expect(screen.getByTestId("page-action")).toBeInTheDocument();
  });
});
