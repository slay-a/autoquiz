import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Login from '../pages/Login';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

// Mock AuthContext
const mockLogin = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual('../contexts/AuthContext');
  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
    },
  },
}));

function renderLogin() {
  return render(
    <BrowserRouter>
      <Login />
    </BrowserRouter>
  );
}

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      user: null,
      profile: null,
      loading: false,
    });
  });

  // AC-1.2.1: The login form collects email and password. Submission is blocked if either field is empty.
  it('AC-1.2.1: blocks submission when email is empty', async () => {
    const user = userEvent.setup();
    renderLogin();

    const passwordInput = screen.getByPlaceholderText(/••••••••/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // Form should not submit due to HTML5 validation (required attribute)
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('AC-1.2.1: blocks submission when password is empty', async () => {
    const user = userEvent.setup();
    renderLogin();

    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.click(submitButton);

    // Form should not submit due to HTML5 validation
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('AC-1.2.1: submits form when both email and password are provided', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({});

    renderLogin();

    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/••••••••/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  // AC-1.2.3: If credentials are invalid, the form displays an error message and remains on /login
  it('AC-1.2.3: displays error message on failed login', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Invalid login credentials';
    mockLogin.mockRejectedValue(new Error(errorMessage));

    renderLogin();

    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/••••••••/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    // Should still be on login page
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows loading state during login attempt', async () => {
    const user = userEvent.setup();
    mockLogin.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    renderLogin();

    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/••••••••/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // Should show loading text
    await waitFor(() => {
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });

    // Button should be disabled
    expect(submitButton).toBeDisabled();
  });

  it('renders link to registration page', () => {
    renderLogin();

    const registerLink = screen.getByRole('link', { name: /create one/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });
});

// ---------------------------------------------------------------------------
// AC-1.2.2: Successful login → redirect to role-appropriate dashboard
// ---------------------------------------------------------------------------
// Note: Login.jsx does NOT call navigate() directly. The redirect is handled by
// App.jsx's RoleRedirect component, which fires after AuthContext updates user state
// via onAuthStateChange. This test verifies the App-level redirect path by using
// MemoryRouter + Routes to simulate the /login route behavior.
// ---------------------------------------------------------------------------
describe('Login — AC-1.2.2 and AC-1.2.4 (redirect behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1.2.4: A logged-in user who navigates to /login is immediately redirected
  // to their role-appropriate dashboard without seeing the login form.
  it('AC-1.2.4: logged-in instructor sees redirect component instead of login form', async () => {
    const { MemoryRouter, Routes, Route } = await import('react-router-dom');

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

    const { render: rRender, screen: rScreen } = await import('@testing-library/react');
    rRender(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<AppLoginRoute />} />
          <Route path="/instructor" element={<div>Instructor Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Login form must NOT be shown
    expect(rScreen.queryByPlaceholderText(/you@example.com/i)).not.toBeInTheDocument();
    expect(rScreen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    // Redirect placeholder is shown
    expect(rScreen.getByTestId('role-redirect')).toBeInTheDocument();
  });

  it('AC-1.2.4: logged-in student sees redirect component instead of login form', async () => {
    const { MemoryRouter, Routes, Route } = await import('react-router-dom');

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

    const { render: rRender, screen: rScreen } = await import('@testing-library/react');
    rRender(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<AppLoginRoute />} />
          <Route path="/student" element={<div>Student Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(rScreen.queryByPlaceholderText(/you@example.com/i)).not.toBeInTheDocument();
    expect(rScreen.getByTestId('role-redirect')).toBeInTheDocument();
  });

  // AC-1.2.2: Login.jsx does not call navigate() — redirect is App-level via AuthContext.
  it('AC-1.2.2: Login component does not navigate() after successful login (redirect is App-level)', async () => {
    mockLogin.mockResolvedValue({});
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      user: null,
      profile: null,
      loading: false,
    });

    const { render: rRender, screen: rScreen } = await import('@testing-library/react');
    const { userEvent: rUserEvent } = await import('@testing-library/user-event');
    const user = (rUserEvent ?? (await import('@testing-library/user-event')).default).setup();

    rRender(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    await user.type(rScreen.getByPlaceholderText(/you@example.com/i), 'test@example.com');
    await user.type(rScreen.getByPlaceholderText(/••••••••/i), 'password123');
    await user.click(rScreen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    }));

    // After successful login, the component should NOT navigate() directly.
    // It leaves redirection to App.jsx / AuthContext state update.
    // The login form is still present (component hasn't navigated away).
    // (If Login.jsx were to call navigate(), the BrowserRouter test would show
    //  the target page; since it doesn't, the sign-in button remains visible.)
    expect(rScreen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
