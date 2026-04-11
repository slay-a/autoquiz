import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

// Mock the AuthContext
vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual('../contexts/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn(),
  },
}));

const TestComponent = () => <div>Protected Content</div>;

function renderProtectedRoute(props, authValue, initialPath = '/protected') {
  useAuth.mockReturnValue(authValue);

  // Create a custom history object to control initial location
  window.history.pushState({}, 'Test page', initialPath);

  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/protected" element={<ProtectedRoute {...props}><TestComponent /></ProtectedRoute>} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/instructor" element={<div>Instructor Dashboard</div>} />
        <Route path="/student" element={<div>Student Dashboard</div>} />
      </Routes>
    </BrowserRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1.5.4: While AuthContext is loading, protected routes render a spinner and do not redirect prematurely
  it('AC-1.5.4: shows spinner while loading', () => {
    renderProtectedRoute({}, { loading: true, user: null, profile: null });

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  // AC-1.5.4: Shows spinner when user exists but profile is still loading
  it('AC-1.5.4: shows spinner when user exists but profile is not yet loaded', () => {
    renderProtectedRoute({}, {
      loading: false,
      user: { id: 'u1' },
      profile: null
    });

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  // AC-1.5.3: Any route wrapped in <ProtectedRoute> (no role specified) redirects an unauthenticated user to /login
  it('AC-1.5.3: redirects unauthenticated user to /login', () => {
    renderProtectedRoute({}, { loading: false, user: null, profile: null });

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  // AC-1.5.1: Any route wrapped in <ProtectedRoute allowedRole="instructor"> redirects a student to /student
  it('AC-1.5.1: redirects student to /student when accessing instructor-only route', () => {
    const studentProfile = { id: 'u1', role: 'student', email: 'student@test.com' };

    renderProtectedRoute(
      { allowedRole: 'instructor' },
      { loading: false, user: { id: 'u1' }, profile: studentProfile }
    );

    expect(screen.getByText('Student Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  // AC-1.5.2: Any route wrapped in <ProtectedRoute allowedRole="student"> redirects an instructor to /instructor
  it('AC-1.5.2: redirects instructor to /instructor when accessing student-only route', () => {
    const instructorProfile = { id: 'u2', role: 'instructor', email: 'instructor@test.com' };

    renderProtectedRoute(
      { allowedRole: 'student' },
      { loading: false, user: { id: 'u2' }, profile: instructorProfile }
    );

    expect(screen.getByText('Instructor Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  // Verify that users with correct role can access the route
  it('allows instructor to access instructor-only route', () => {
    const instructorProfile = { id: 'u2', role: 'instructor', email: 'instructor@test.com' };

    renderProtectedRoute(
      { allowedRole: 'instructor' },
      { loading: false, user: { id: 'u2' }, profile: instructorProfile }
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('allows student to access student-only route', () => {
    const studentProfile = { id: 'u1', role: 'student', email: 'student@test.com' };

    renderProtectedRoute(
      { allowedRole: 'student' },
      { loading: false, user: { id: 'u1' }, profile: studentProfile }
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('allows authenticated user to access route with no role restriction', () => {
    const studentProfile = { id: 'u1', role: 'student', email: 'student@test.com' };

    renderProtectedRoute(
      {},
      { loading: false, user: { id: 'u1' }, profile: studentProfile }
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
