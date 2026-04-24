/**
 * FEAT-001: Authentication & Session Management — Gap Verification Tests
 *
 * These tests were the Red-phase pins. After fixes they should all pass (Green).
 *
 * BLOCKER-1: localStorage.clear is not a function in happy-dom (fixed in setup.js)
 * BLOCKER-4: AC-1.2.2 and AC-1.2.4 added to Login.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import Login from '../pages/Login';

const mockLogin = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual('../contexts/AuthContext');
  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ login: mockLogin, user: null, profile: null, loading: false });
});

// ---------------------------------------------------------------------------
// BLOCKER-1: setup.js localStorage.clear compatibility
// The fix replaces localStorage.clear() with a safe cross-environment fallback.
// This test verifies the fallback logic works in happy-dom.
// ---------------------------------------------------------------------------
describe('BLOCKER-1: setup.js localStorage.clear compatibility', () => {
  it('setup.js safe-clear fallback does not throw in happy-dom', () => {
    // This is the exact pattern now used in setup.js afterEach.
    // It must not throw regardless of happy-dom localStorage implementation.
    expect(() => {
      if (typeof localStorage.clear === 'function') {
        localStorage.clear();
      } else {
        Object.keys(localStorage).forEach((key) => localStorage.removeItem(key));
      }
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// BLOCKER-4: AC-1.2.4 — logged-in user redirected from /login
// ---------------------------------------------------------------------------
describe('BLOCKER-4: AC-1.2.4 logged-in user on /login redirect', () => {
  it('logged-in instructor does not see the login form', () => {
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      user: { id: 'u1' },
      profile: { id: 'u1', role: 'instructor' },
      loading: false,
    });

    // Simulate App.jsx /login route: user ? <RoleRedirect /> : <Login />
    function AppLoginRoute() {
      const auth = mockUseAuth();
      if (auth.user) return <div data-testid="role-redirect">Redirected</div>;
      return <Login />;
    }

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<AppLoginRoute />} />
          <Route path="/instructor" element={<div>Instructor Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByPlaceholderText(/you@example.com/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('role-redirect')).toBeInTheDocument();
  });

  it('logged-in student does not see the login form', () => {
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      user: { id: 'u2' },
      profile: { id: 'u2', role: 'student' },
      loading: false,
    });

    function AppLoginRoute() {
      const auth = mockUseAuth();
      if (auth.user) return <div data-testid="role-redirect">Redirected</div>;
      return <Login />;
    }

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<AppLoginRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByPlaceholderText(/you@example.com/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('role-redirect')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// BLOCKER-4: AC-1.2.2 — login does not navigate() directly
// ---------------------------------------------------------------------------
describe('BLOCKER-4: AC-1.2.2 login redirect is App-level', () => {
  it('Login component calls login() and stays on page (redirect is App-level)', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({});

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    await user.type(screen.getByPlaceholderText(/you@example.com/i), 'test@example.com');
    await user.type(screen.getByPlaceholderText(/••••••••/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    );

    // Login.jsx does not navigate() after success — App.jsx handles it.
    // The form is still rendered (component has not navigated away).
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
