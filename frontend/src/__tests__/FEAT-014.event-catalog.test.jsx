/**
 * FEAT-014 — §14.3 Event Catalog Completeness
 * Red-phase frontend tests: pins gaps B-8, B-9, B-10
 *
 * B-8: frontend/src/utils/logEvent.js shim must exist and export logEvent()
 * B-9: AuthContext must call logEvent on sign-in (auth.session.started) and sign-out (auth.session.ended)
 * B-10: Profile page must call logEvent("profile.updated", {fields_changed: [...]}) after successful save
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// ── B-8: logEvent shim existence and shape ────────────────────────────────

describe('B-8: logEvent shim (frontend/src/utils/logEvent.js)', () => {
  it('exports a logEvent function', async () => {
    // This import will throw if the file does not exist — that is the red failure.
    let logEvent;
    try {
      const mod = await import('../utils/logEvent.js');
      logEvent = mod.logEvent || mod.default;
    } catch (e) {
      throw new Error(
        'frontend/src/utils/logEvent.js does not exist. ' +
        'AC-8.1: A logEvent(event, fields) shim must be created in this file. ' +
        `Import error: ${e.message}`
      );
    }
    expect(typeof logEvent).toBe('function', 'logEvent must be exported as a function');
  });

  it('logEvent writes a §14.1-conformant envelope to console.info', async () => {
    // Use vi.importActual to bypass the vi.mock hoisting and get the real module.
    let logEvent;
    try {
      const mod = await vi.importActual('../utils/logEvent.js');
      logEvent = mod.logEvent || mod.default;
    } catch (e) {
      throw new Error(`frontend/src/utils/logEvent.js missing or broken: ${e.message}`);
    }

    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logEvent('auth.session.started', {});

    expect(consoleSpy).toHaveBeenCalled();
    // The call argument must be parseable JSON with required envelope fields
    const rawArg = consoleSpy.mock.calls[0][0];
    let envelope;
    try {
      envelope = typeof rawArg === 'string' ? JSON.parse(rawArg) : rawArg;
    } catch {
      throw new Error(`console.info was not called with JSON. Got: ${rawArg}`);
    }

    expect(envelope).toHaveProperty('event', 'auth.session.started');
    expect(envelope).toHaveProperty('level');
    expect(envelope).toHaveProperty('outcome');
    expect(envelope).toHaveProperty('timestamp');

    consoleSpy.mockRestore();
  });

  it('logEvent does not include PII fields (email, name) in the envelope', async () => {
    let logEvent;
    try {
      const mod = await vi.importActual('../utils/logEvent.js');
      logEvent = mod.logEvent || mod.default;
    } catch (e) {
      throw new Error(`frontend/src/utils/logEvent.js missing — cannot test PII rule: ${e.message}`);
    }

    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    // Pass PII-like fields — they must be stripped or never logged
    logEvent('profile.updated', { email: 'user@test.com', fields_changed: ['full_name'] });

    const rawArg = consoleSpy.mock.calls[0]?.[0] || '';
    const asString = typeof rawArg === 'string' ? rawArg : JSON.stringify(rawArg);
    expect(asString).not.toContain('user@test.com');

    consoleSpy.mockRestore();
  });
});

// ── B-9: AuthContext emits auth.session.started and auth.session.ended ────

// Mock supabase
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

// Mock logEvent — we need to spy on it to verify calls from AuthContext
vi.mock('../utils/logEvent.js', () => ({
  logEvent: vi.fn(),
}));

import { supabase as mockSupabase } from '../lib/supabase';

describe('B-9: AuthContext emits auth session events', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('calls logEvent("auth.session.started") when SIGNED_IN event fires', async () => {
    const { logEvent: mockLogEvent } = await import('../utils/logEvent.js');

    // Capture the onAuthStateChange callback
    let authCallback;
    mockSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'u1', role: 'student', email: 's@test.com', full_name: 'S' },
        error: null,
      }),
    });

    const { AuthProvider } = await import('../contexts/AuthContext');
    const { render: rtlRender } = await import('@testing-library/react');
    rtlRender(<AuthProvider><div /></AuthProvider>);

    // Simulate a SIGNED_IN event
    await waitFor(() => expect(authCallback).toBeDefined());
    authCallback('SIGNED_IN', {
      user: { id: 'u1', email: 's@test.com', user_metadata: { role: 'student' } },
    });

    await waitFor(() => {
      const calls = mockLogEvent.mock.calls.map(c => c[0]);
      expect(calls).toContain('auth.session.started');
    }, { timeout: 2000 });
  });

  it('calls logEvent("auth.session.ended") when SIGNED_OUT event fires', async () => {
    const { logEvent: mockLogEvent } = await import('../utils/logEvent.js');

    let authCallback;
    mockSupabase.auth.onAuthStateChange.mockImplementation((cb) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const { AuthProvider } = await import('../contexts/AuthContext');
    const { render: rtlRender } = await import('@testing-library/react');
    rtlRender(<AuthProvider><div /></AuthProvider>);

    await waitFor(() => expect(authCallback).toBeDefined());
    authCallback('SIGNED_OUT', null);

    await waitFor(() => {
      const calls = mockLogEvent.mock.calls.map(c => c[0]);
      expect(calls).toContain('auth.session.ended');
    }, { timeout: 2000 });
  });
});

// ── B-10: Profile page emits profile.updated after successful save ────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual('../contexts/AuthContext');
  return { ...actual, useAuth: () => mockUseAuth() };
});

describe('B-10: Profile page emits profile.updated after successful save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123' },
      profile: {
        id: 'user-123',
        full_name: 'Test User',
        email: 'test@example.com',
        role: 'student',
        avatar_url: null,
      },
    });
    // Stub window.location.reload
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { reload: vi.fn() },
    });
  });

  it('calls logEvent("profile.updated", {fields_changed: [...]}) after successful save', async () => {
    const { logEvent: mockLogEvent } = await import('../utils/logEvent.js');

    // Mock supabase update chain to succeed
    mockSupabase.from.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const Profile = (await import('../pages/Profile')).default;
    const { getByRole } = render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    const saveBtn = getByRole('button', { name: /save changes/i });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      const calls = mockLogEvent.mock.calls.map(c => c[0]);
      expect(calls).toContain('profile.updated');
    }, { timeout: 2000 });

    // Verify fields_changed is in the second argument
    const profileUpdatedCall = mockLogEvent.mock.calls.find(c => c[0] === 'profile.updated');
    expect(profileUpdatedCall).toBeDefined();
    const fields = profileUpdatedCall[1];
    expect(fields).toHaveProperty('fields_changed');
    expect(Array.isArray(fields.fields_changed)).toBe(true);
  });

  it('does NOT call logEvent("profile.updated") when save fails', async () => {
    const { logEvent: mockLogEvent } = await import('../utils/logEvent.js');

    mockSupabase.from.mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
    });

    const Profile = (await import('../pages/Profile')).default;
    const { getByRole } = render(
      <BrowserRouter>
        <Profile />
      </BrowserRouter>
    );

    const saveBtn = getByRole('button', { name: /save changes/i });
    await userEvent.click(saveBtn);

    // Wait a tick for async
    await new Promise(r => setTimeout(r, 100));

    const calls = mockLogEvent.mock.calls.map(c => c[0]);
    expect(calls).not.toContain('profile.updated');
  });
});
