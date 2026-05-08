import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import Profile from '../pages/Profile';

/**
 * FEAT-013 — User Profile (Avatar & Display Name)
 *
 * Covers Story 13.1 (view/edit profile) and Story 13.2 (save profile changes).
 * Story 13.3 (navbar) is exercised separately in Navbar.FEAT-013.test.jsx.
 *
 * AC-13.1.1 (profile page is reachable only by authenticated users; both
 * roles permitted) is covered by composition: ProtectedRoute.test.jsx
 * verifies the auth/role gate (AC-1.5.x); App.jsx routes /profile through
 * <ProtectedRoute allowedRole={["student","instructor"]}>; this file
 * verifies the Profile component renders for authenticated users. The
 * array-form `allowedRole` (multi-role) is not directly unit-tested in
 * ProtectedRoute.test.jsx — verified manually pre-demo.
 *
 * Test boundaries per spec §7:
 *   - Mock useAuth to return synthetic user + profile fixtures
 *   - Mock supabase.from('profiles').update(...).eq('id', ...)
 *   - Spy on window.location.reload (AC-13.2.3 only asserts it was called)
 *   - DO NOT assert on DiceBear network reachability or image rendering
 */

// ── Mock AuthContext ──────────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// ── Mock react-router-dom navigate ────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Mock supabase ─────────────────────────────────────────────────
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../lib/supabase';

// ── Fixtures (spec §7) ────────────────────────────────────────────
const DICEBEAR = (seed) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

const userA = { id: 'user-a', email: 'a@test.com' };

const profileEmptyAvatar = {
  id: 'user-a',
  email: 'a@test.com',
  full_name: 'Alice Anderson',
  role: 'student',
  avatar_url: null,
};

const profileWithAvatar = {
  ...profileEmptyAvatar,
  avatar_url: DICEBEAR('coral'),
};

function renderProfile() {
  return render(
    <BrowserRouter>
      <Profile />
    </BrowserRouter>
  );
}

// Shared: build a mock `update().eq()` chain that resolves to a given value.
// Returns { updateFn, eqFn } so individual tests can assert on call args.
function mockProfilesUpdate(eqResult) {
  const eqFn = vi.fn().mockResolvedValue(eqResult);
  const updateFn = vi.fn(() => ({ eq: eqFn }));
  supabase.from.mockImplementation((table) => {
    if (table === 'profiles') return { update: updateFn };
    throw new Error(`Unexpected supabase.from("${table}")`);
  });
  return { updateFn, eqFn };
}

describe('Profile — FEAT-013', () => {
  let reloadSpy;
  let originalLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: userA, profile: profileEmptyAvatar });

    // Replace window.location with a stub whose reload is a spy.
    // jsdom/happy-dom don't allow direct assignment of window.location.reload.
    originalLocation = window.location;
    reloadSpy = vi.fn();
    delete window.location;
    window.location = { ...originalLocation, reload: reloadSpy };
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  // ── Story 13.1 ────────────────────────────────────────────────

  // AC-13.1.2: preview renders avatar image, current full_name, email, role
  it('AC-13.1.2: preview shows current full_name, email, and capitalized role', () => {
    renderProfile();

    // Preview block shows current name
    expect(screen.getByText('Alice Anderson')).toBeInTheDocument();

    // Email
    expect(screen.getByText('a@test.com')).toBeInTheDocument();

    // Role — stored lowercase; CSS `capitalize` handles the visual cap,
    // so we assert the underlying text + the `capitalize` class on its node.
    const roleNode = screen.getByText('student');
    expect(roleNode).toBeInTheDocument();
    expect(roleNode.className).toMatch(/capitalize/);

    // Avatar preview <img> is rendered (the large one in the preview block)
    const previewImg = screen.getByAltText('Selected avatar');
    expect(previewImg).toBeInTheDocument();
    expect(previewImg.getAttribute('src')).toMatch(
      /^https:\/\/api\.dicebear\.com\/7\.x\/avataaars\/svg\?seed=/
    );
  });

  // AC-13.1.3: display-name input pre-filled, has required + minLength=1 + maxLength=80
  it('AC-13.1.3: display-name input is pre-filled and has correct constraints', () => {
    renderProfile();

    const input = screen.getByLabelText(/display name/i);
    expect(input).toHaveValue('Alice Anderson');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('minLength', '1');
    expect(input).toHaveAttribute('maxLength', '80');
  });

  // AC-13.1.3: Save button is disabled while trimmed value is empty
  it('AC-13.1.3: Save is disabled when name is empty or whitespace', async () => {
    const user = userEvent.setup();
    renderProfile();

    const input = screen.getByLabelText(/display name/i);
    const save = screen.getByRole('button', { name: /save changes/i });

    // Pre-filled name → Save enabled
    expect(save).toBeEnabled();

    // Clear name → disabled
    await user.clear(input);
    expect(save).toBeDisabled();

    // Whitespace-only → still disabled (relies on .trim())
    await user.type(input, '   ');
    expect(save).toBeDisabled();

    // Real content → enabled
    await user.clear(input);
    await user.type(input, 'Alice');
    expect(save).toBeEnabled();
  });

  // AC-13.1.4: avatar picker renders 8 DiceBear presets; clicking updates preview
  // without writing to Supabase; selected state is visible.
  it('AC-13.1.4: clicking a preset updates the preview and shows selected state without calling supabase', async () => {
    const { updateFn } = mockProfilesUpdate({ data: null, error: null });
    const user = userEvent.setup();
    renderProfile();

    // The 8 presets render as <img alt={seed}> inside <button>s.
    // Grab "mint" — a seed other than the default "violet".
    const mintImg = screen.getByAltText('mint');
    const mintButton = mintImg.closest('button');
    expect(mintButton).toBeInTheDocument();

    await user.click(mintButton);

    // Preview image now points at the mint DiceBear URL
    const preview = screen.getByAltText('Selected avatar');
    expect(preview.getAttribute('src')).toBe(DICEBEAR('mint'));

    // Selected state (visible ring/border) applied to the clicked preset
    expect(mintButton.className).toMatch(/border-violet-500/);

    // Clicking a preset must not write to Supabase
    expect(updateFn).not.toHaveBeenCalled();
  });

  // AC-13.1.4: initial selected state reflects an existing profile.avatar_url
  it('AC-13.1.4: when profile.avatar_url is set, the matching preset is initially selected', () => {
    mockUseAuth.mockReturnValue({ user: userA, profile: profileWithAvatar });
    renderProfile();

    const coralImg = screen.getByAltText('coral');
    const coralButton = coralImg.closest('button');
    expect(coralButton.className).toMatch(/border-violet-500/);

    // And the preview reflects the stored URL
    const preview = screen.getByAltText('Selected avatar');
    expect(preview.getAttribute('src')).toBe(profileWithAvatar.avatar_url);
  });

  // ── Story 13.2 ────────────────────────────────────────────────

  // AC-13.2.1 + AC-13.2.2: submit calls update with exactly
  // { full_name trimmed, avatar_url } and .eq('id', user.id) only —
  // no other columns are sent.
  it('AC-13.2.1/2: submit calls supabase.update with trimmed full_name + avatar_url and .eq id=user.id', async () => {
    const { updateFn, eqFn } = mockProfilesUpdate({ data: null, error: null });
    const user = userEvent.setup();
    renderProfile();

    // Change the name (with trailing whitespace to prove trim())
    const input = screen.getByLabelText(/display name/i);
    await user.clear(input);
    await user.type(input, '  Alice Renamed  ');

    // Pick a different avatar
    const sunnyBtn = screen.getByAltText('sunny').closest('button');
    await user.click(sunnyBtn);

    // Submit
    const save = screen.getByRole('button', { name: /save changes/i });
    await user.click(save);

    await waitFor(() => expect(updateFn).toHaveBeenCalledTimes(1));

    // Only full_name + avatar_url in the payload (AC-13.2.2)
    const payload = updateFn.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['avatar_url', 'full_name']);
    expect(payload.full_name).toBe('Alice Renamed'); // trimmed
    expect(payload.avatar_url).toBe(DICEBEAR('sunny'));

    // .eq('id', user.id) scoping (AC-13.2.1)
    expect(eqFn).toHaveBeenCalledTimes(1);
    expect(eqFn).toHaveBeenCalledWith('id', userA.id);
  });

  // AC-13.2.3 (loading): Save is disabled + shows loading state while awaiting
  it('AC-13.2.3: Save shows loading state and is disabled while saving', async () => {
    // Build an eq() that stays pending until we resolve it manually
    let resolveEq;
    const eqFn = vi.fn(
      () => new Promise((res) => { resolveEq = () => res({ data: null, error: null }); })
    );
    const updateFn = vi.fn(() => ({ eq: eqFn }));
    supabase.from.mockImplementation(() => ({ update: updateFn }));

    const user = userEvent.setup();
    renderProfile();

    const save = screen.getByRole('button', { name: /save changes/i });
    await user.click(save);

    // Mid-save: button text flipped to "Saving…" and is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    });

    // Let it complete so the test doesn't hang on cleanup
    resolveEq();
    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());
  });

  // AC-13.2.3 (success): confirmation rendered + window.location.reload called
  it('AC-13.2.3: on success shows confirmation and triggers window.location.reload', async () => {
    mockProfilesUpdate({ data: null, error: null });
    const user = userEvent.setup();
    renderProfile();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // Confirmation message appears
    await waitFor(() => {
      expect(screen.getByText(/saved!/i)).toBeInTheDocument();
    });

    // reload is called (on a 600ms timer — waitFor polls past it)
    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
  });

  // AC-13.2.3 (failure): error from Supabase rendered inline; form remains editable
  it('AC-13.2.3: on failure renders Supabase error and leaves form editable', async () => {
    mockProfilesUpdate({
      data: null,
      error: { message: 'new row violates row-level security policy for table "profiles"' },
    });
    const user = userEvent.setup();
    renderProfile();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    // Error surface
    await waitFor(() => {
      expect(
        screen.getByText(/row-level security policy for table "profiles"/i)
      ).toBeInTheDocument();
    });

    // Form stays editable: input still enabled, Save re-enabled (not in saving state)
    const input = screen.getByLabelText(/display name/i);
    expect(input).toBeEnabled();
    const save = screen.getByRole('button', { name: /save changes/i });
    expect(save).toBeEnabled();

    // No reload on failure
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
