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
