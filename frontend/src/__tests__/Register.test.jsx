import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import Register from '../pages/Register';

// Mock AuthContext
const mockRegister = vi.fn();
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
    },
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderRegister() {
  return render(
    <BrowserRouter>
      <Register />
    </BrowserRouter>
  );
}

describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      register: mockRegister,
      user: null,
      profile: null,
      loading: false,
    });
  });

  // AC-1.1.1: The registration form collects full_name, email, password, and role. Submission is blocked if any field is empty.
  it('AC-1.1.1: blocks submission when full name is empty', async () => {
    const user = userEvent.setup();
    renderRegister();

    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/min\. 6 characters/i);
    const instructorButton = screen.getByRole('button', { name: /instructor/i });
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.click(instructorButton);
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    // Form should not submit due to HTML5 validation
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('AC-1.1.1: blocks submission when email is empty', async () => {
    const user = userEvent.setup();
    renderRegister();

    const nameInput = screen.getByPlaceholderText(/your name/i);
    const passwordInput = screen.getByPlaceholderText(/min\. 6 characters/i);
    const instructorButton = screen.getByRole('button', { name: /instructor/i });
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.click(instructorButton);
    await user.type(nameInput, 'Test User');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('AC-1.1.1: blocks submission when password is empty', async () => {
    const user = userEvent.setup();
    renderRegister();

    const nameInput = screen.getByPlaceholderText(/your name/i);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const instructorButton = screen.getByRole('button', { name: /instructor/i });
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.click(instructorButton);
    await user.type(nameInput, 'Test User');
    await user.type(emailInput, 'test@example.com');
    await user.click(submitButton);

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('AC-1.1.1: blocks submission when role is not selected', async () => {
    const user = userEvent.setup();
    renderRegister();

    const nameInput = screen.getByPlaceholderText(/your name/i);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/min\. 6 characters/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.type(nameInput, 'Test User');
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');

    // Button should be disabled when no role selected
    expect(submitButton).toBeDisabled();
  });

  // AC-1.1.2 (partial): full_name, email, password, and role are forwarded to register() with the values the user typed. DB row creation itself is out of jsdom scope — verified manually pre-demo.
  it('AC-1.1.1 / AC-1.1.2: submits form with correct full_name, email, password, role payload', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue({});

    renderRegister();

    const nameInput = screen.getByPlaceholderText(/your name/i);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/min\. 6 characters/i);
    const instructorButton = screen.getByRole('button', { name: /instructor/i });
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.click(instructorButton);
    await user.type(nameInput, 'Test User');
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
        role: 'instructor',
      });
    });
  });

  // AC-1.1.3: After registration, the user is redirected to the role-appropriate dashboard
  it('AC-1.1.3: redirects to /instructor after instructor registration', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue({});

    renderRegister();

    const nameInput = screen.getByPlaceholderText(/your name/i);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/min\. 6 characters/i);
    const instructorButton = screen.getByRole('button', { name: /instructor/i });
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.click(instructorButton);
    await user.type(nameInput, 'Test User');
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/instructor');
    });
  });

  it('AC-1.1.3: redirects to /student after student registration', async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue({});

    renderRegister();

    const nameInput = screen.getByPlaceholderText(/your name/i);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/min\. 6 characters/i);
    const studentButton = screen.getByRole('button', { name: /student/i });
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.click(studentButton);
    await user.type(nameInput, 'Test Student');
    await user.type(emailInput, 'student@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/student');
    });
  });

  // AC-1.1.4: If the email is already registered, the form displays an error message and does not navigate away
  it('AC-1.1.4: displays error message when email is already registered', async () => {
    const user = userEvent.setup();
    const errorMessage = 'User already registered';
    mockRegister.mockRejectedValue(new Error(errorMessage));

    renderRegister();

    const nameInput = screen.getByPlaceholderText(/your name/i);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/min\. 6 characters/i);
    const instructorButton = screen.getByRole('button', { name: /instructor/i });
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.click(instructorButton);
    await user.type(nameInput, 'Test User');
    await user.type(emailInput, 'existing@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    // Should not navigate
    expect(mockNavigate).not.toHaveBeenCalled();

    // Should still be on registration page
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows loading state during registration', async () => {
    const user = userEvent.setup();
    mockRegister.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    renderRegister();

    const nameInput = screen.getByPlaceholderText(/your name/i);
    const emailInput = screen.getByPlaceholderText(/you@example.com/i);
    const passwordInput = screen.getByPlaceholderText(/min\. 6 characters/i);
    const instructorButton = screen.getByRole('button', { name: /instructor/i });
    const submitButton = screen.getByRole('button', { name: /create account/i });

    await user.click(instructorButton);
    await user.type(nameInput, 'Test User');
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/creating account/i)).toBeInTheDocument();
    });

    expect(submitButton).toBeDisabled();
  });

  it('allows switching between instructor and student roles', async () => {
    const user = userEvent.setup();
    renderRegister();

    const instructorButton = screen.getByRole('button', { name: /instructor/i });
    const studentButton = screen.getByRole('button', { name: /student/i });

    // Initially no role selected, submit button disabled
    const submitButton = screen.getByRole('button', { name: /create account/i });
    expect(submitButton).toBeDisabled();

    // Select instructor
    await user.click(instructorButton);
    expect(submitButton).not.toBeDisabled();

    // Switch to student
    await user.click(studentButton);
    expect(submitButton).not.toBeDisabled();
  });

  it('renders link to login page', () => {
    renderRegister();

    const loginLink = screen.getByRole('link', { name: /sign in/i });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute('href', '/login');
  });
});
