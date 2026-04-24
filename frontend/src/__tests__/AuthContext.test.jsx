import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

// Mock supabase - must use factory function for hoisting
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
    },
    from: vi.fn(),
  },
}));

// Import after mocking
import { supabase as mockSupabase } from '../lib/supabase';

// Test component to access AuthContext
function TestConsumer() {
  const { user, profile, loading } = useAuth();
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="user">{user ? user.id : 'no-user'}</div>
      <div data-testid="profile">{profile ? profile.role : 'no-profile'}</div>
    </div>
  );
}

function renderAuthProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

describe('AuthContext - Session Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage.clear === 'function') { localStorage.clear(); } else { Object.keys(localStorage).forEach(k => localStorage.removeItem(k)); }

    // Default mock: no session
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });
  });

  // AC-1.3.1: On page reload, the app reads the Supabase session from localStorage without making a network request during the initial render
  it('AC-1.3.1: reads session from localStorage synchronously on mount', () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
    const mockUser = { id: 'u1', email: 'test@example.com' };
    const mockProfile = { id: 'u1', full_name: 'Test User', email: 'test@example.com', role: 'instructor' };

    // Simulate Supabase's localStorage structure
    localStorage.setItem(
      'sb-test-auth-token',
      JSON.stringify({
        user: mockUser,
        expires_at: futureTimestamp,
      })
    );

    // AC-1.3.4: The user's profile is cached in localStorage under the key aq_profile
    localStorage.setItem('aq_profile', JSON.stringify(mockProfile));

    renderAuthProvider();

    // Should immediately show user from localStorage (no loading state)
    expect(screen.getByTestId('user')).toHaveTextContent('u1');
    expect(screen.getByTestId('profile')).toHaveTextContent('instructor');
    expect(screen.getByTestId('loading')).toHaveTextContent('ready');
  });

  // AC-1.3.2: If the stored session has more than 60 seconds remaining, the user is treated as authenticated immediately
  it('AC-1.3.2: treats user as authenticated when session has >60s remaining', () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now
    const mockUser = { id: 'u1', email: 'test@example.com' };
    const mockProfile = { id: 'u1', full_name: 'Test User', email: 'test@example.com', role: 'student' };

    localStorage.setItem(
      'sb-test-auth-token',
      JSON.stringify({
        user: mockUser,
        expires_at: futureTimestamp,
      })
    );
    localStorage.setItem('aq_profile', JSON.stringify(mockProfile));

    renderAuthProvider();

    // Loading should be false immediately
    expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    expect(screen.getByTestId('user')).toHaveTextContent('u1');
    expect(screen.getByTestId('profile')).toHaveTextContent('student');
  });

  // AC-1.3.3: If the stored session is expired or absent, the user is redirected to /login (treated as unauthenticated)
  it('AC-1.3.3: treats user as unauthenticated when session is expired', async () => {
    const pastTimestamp = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
    const mockUser = { id: 'u1', email: 'test@example.com' };

    localStorage.setItem(
      'sb-test-auth-token',
      JSON.stringify({
        user: mockUser,
        expires_at: pastTimestamp, // Expired
      })
    );

    renderAuthProvider();

    // User should not be restored from expired session
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(screen.getByTestId('profile')).toHaveTextContent('no-profile');

    // Wait for getSession to complete
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });
  });

  // AC-1.3.3: Session absent
  it('AC-1.3.3: treats user as unauthenticated when no session in localStorage', async () => {
    renderAuthProvider();

    // Should start loading
    expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    expect(screen.getByTestId('profile')).toHaveTextContent('no-profile');
  });

  // AC-1.3.4: The user's profile is cached in localStorage under the key aq_profile and restored synchronously on reload
  it('AC-1.3.4: restores profile from aq_profile localStorage key', () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 600;
    const mockUser = { id: 'u1', email: 'test@example.com' };
    const mockProfile = { id: 'u1', full_name: 'Test User', email: 'test@example.com', role: 'instructor' };

    localStorage.setItem(
      'sb-test-auth-token',
      JSON.stringify({
        user: mockUser,
        expires_at: futureTimestamp,
      })
    );
    localStorage.setItem('aq_profile', JSON.stringify(mockProfile));

    renderAuthProvider();

    // Profile should be restored immediately
    expect(screen.getByTestId('profile')).toHaveTextContent('instructor');
    expect(screen.getByTestId('loading')).toHaveTextContent('ready');
  });

  // Test session with <60 seconds remaining is not trusted
  it('does not restore session with less than 60 seconds remaining', async () => {
    const almostExpired = Math.floor(Date.now() / 1000) + 30; // 30 seconds from now
    const mockUser = { id: 'u1', email: 'test@example.com' };

    localStorage.setItem(
      'sb-test-auth-token',
      JSON.stringify({
        user: mockUser,
        expires_at: almostExpired,
      })
    );

    renderAuthProvider();

    // Should not restore user from session with <60s remaining
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });
  });

  // Test profile ID mismatch is handled
  it('does not restore profile if ID does not match user ID', () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 600;
    const mockUser = { id: 'u1', email: 'test@example.com' };
    const mockProfile = { id: 'u2', full_name: 'Wrong User', email: 'wrong@example.com', role: 'student' };

    localStorage.setItem(
      'sb-test-auth-token',
      JSON.stringify({
        user: mockUser,
        expires_at: futureTimestamp,
      })
    );
    localStorage.setItem('aq_profile', JSON.stringify(mockProfile));

    renderAuthProvider();

    // Should restore user but not mismatched profile
    expect(screen.getByTestId('user')).toHaveTextContent('u1');
    expect(screen.getByTestId('profile')).toHaveTextContent('no-profile');
    expect(screen.getByTestId('loading')).toHaveTextContent('loading'); // Will load profile from API
  });
});
