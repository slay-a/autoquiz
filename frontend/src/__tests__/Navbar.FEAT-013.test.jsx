import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../contexts/ThemeContext';

/**
 * FEAT-013 — Story 13.3: Avatar surfaces in the navbar
 *
 * The Navbar is defined inside App.jsx and not exported separately. To test
 * its real DOM output we render <App /> with every page module stubbed and
 * AuthContext/supabase mocked out. The router is driven in-memory so we can
 * land on a stable path for assertions.
 *
 * Covered:
 *   AC-13.3.1 — avatar_url → <img> ; null → <User> icon fallback
 *   AC-13.3.2 — avatar/name region wraps <Link to="/profile">
 *   AC-13.3.3 — Logout button remains functional alongside the avatar link
 *   AC-1.4.1 (partial) — clicking Logout invokes AuthContext.logout(); the
 *     downstream signOut() + aq_profile clear + /login redirect live in
 *     AuthContext.test.jsx, not this file.
 *
 * Fix (FEAT-012): App.jsx now uses TopBar → ThemeToggle → useTheme, so the
 * test wrapper must provide <ThemeProvider>. matchMedia is mocked so
 * ThemeProvider can read OS preference safely in happy-dom.
 */

// ── Stub every page module App.jsx pulls in ───────────────────────
vi.mock('../pages/Login', () => ({ default: () => <div>Login</div> }));
vi.mock('../pages/Register', () => ({ default: () => <div>Register</div> }));
vi.mock('../pages/instructor/Dashboard', () => ({
  default: () => <div>InstructorDashboard</div>,
}));
vi.mock('../pages/instructor/ClassView', () => ({
  default: () => <div>ClassView</div>,
}));
vi.mock('../pages/student/Dashboard', () => ({
  default: () => <div>StudentDashboard</div>,
}));
vi.mock('../pages/student/Generate', () => ({
  default: () => <div>Generate</div>,
}));
vi.mock('../pages/QuizStudy', () => ({ default: () => <div>QuizStudy</div> }));
vi.mock('../pages/FlashcardStudy', () => ({
  default: () => <div>FlashcardStudy</div>,
}));
vi.mock('../pages/FlashcardEditor', () => ({
  default: () => <div>FlashcardEditor</div>,
}));
vi.mock('../pages/Notes', () => ({ default: () => <div>Notes</div> }));
vi.mock('../pages/ClassNoteView', () => ({
  default: () => <div>ClassNoteView</div>,
}));
vi.mock('../pages/Profile', () => ({
  default: () => <div>ProfilePage</div>,
}));

// ProtectedRoute gates everything; stub it to render children directly so we
// don't need to reproduce the loading/role-redirect ladder here (covered
// separately in ProtectedRoute.test.jsx).
vi.mock('../components/ProtectedRoute', () => ({
  default: ({ children }) => <>{children}</>,
}));

// ── Mock AuthContext ──────────────────────────────────────────────
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => mockUseAuth(),
}));

// ── Mock supabase (not touched but keeps the import graph happy) ──
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

import App from '../App';

const AVATAR_URL =
  'https://api.dicebear.com/7.x/avataaars/svg?seed=mint';

// Install a minimal matchMedia mock so ThemeProvider can query OS preference
// without crashing in happy-dom.
function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderApp(initialPath = '/student') {
  return render(
    // ThemeProvider is required because App → TopBar → ThemeToggle → useTheme.
    // Providing it here mirrors the real main.jsx wrapper (FEAT-012 AC-12.1.1).
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('Navbar — FEAT-013 Story 13.3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    installMatchMedia();
  });

  // AC-13.3.1: when avatar_url is set, the navbar renders it as an <img>
  it('AC-13.3.1: renders <img> with avatar_url when profile.avatar_url is set', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: {
        id: 'u1',
        full_name: 'Alice Anderson',
        role: 'student',
        avatar_url: AVATAR_URL,
      },
      loading: false,
      logout: mockLogout,
    });

    renderApp();

    const avatar = screen.getByAltText('avatar');
    expect(avatar.tagName).toBe('IMG');
    expect(avatar.getAttribute('src')).toBe(AVATAR_URL);
  });

  // AC-13.3.1: when avatar_url is null, the <User> lucide fallback renders
  // in a neutral circle; no <img alt="avatar"> should exist.
  it('AC-13.3.1: renders User icon fallback when profile.avatar_url is null', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: {
        id: 'u1',
        full_name: 'Alice Anderson',
        role: 'student',
        avatar_url: null,
      },
      loading: false,
      logout: mockLogout,
    });

    renderApp();

    // No <img> avatar in the navbar
    expect(screen.queryByAltText('avatar')).not.toBeInTheDocument();

    // Fallback icon sits in a gray circle — look for a lucide <svg> inside
    // a `bg-gray-100` rounded element (the Profile link).
    const profileLink = screen.getByTitle('Profile');
    expect(profileLink).toBeInTheDocument();
    const circle = profileLink.querySelector('.bg-gray-100.rounded-full');
    expect(circle).toBeInTheDocument();
    // lucide icons render as <svg>
    expect(circle.querySelector('svg')).toBeInTheDocument();
  });

  // AC-13.3.2: avatar/name region is wrapped in <Link to="/profile">
  it('AC-13.3.2: avatar/name region links to /profile', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: {
        id: 'u1',
        full_name: 'Alice Anderson',
        role: 'student',
        avatar_url: AVATAR_URL,
      },
      loading: false,
      logout: mockLogout,
    });

    renderApp();

    // Title lookup is robust to the internal layout
    const profileLink = screen.getByTitle('Profile');
    expect(profileLink.tagName).toBe('A');
    expect(profileLink.getAttribute('href')).toBe('/profile');

    // And the avatar <img> is nested inside that link
    const avatar = screen.getByAltText('avatar');
    expect(profileLink.contains(avatar)).toBe(true);
  });

  // AC-13.3.3 / AC-1.4.1 (partial): Logout button still triggers logout and
  // is separate from the /profile link (so clicking the avatar doesn't fire
  // logout by accident). Verifies AuthContext.logout() is invoked; the
  // signOut + aq_profile clear + redirect chain is owned by AuthContext.
  it('AC-13.3.3 / AC-1.4.1 (partial): Logout button is functional alongside avatar link', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: {
        id: 'u1',
        full_name: 'Alice Anderson',
        role: 'student',
        avatar_url: AVATAR_URL,
      },
      loading: false,
      logout: mockLogout,
    });

    const user = userEvent.setup();
    renderApp();

    // The Logout button is a <button> sibling of the /profile <Link>,
    // identified via its lucide LogOut icon-only label. Find it by class
    // hover:text-red-500 which is unique to Logout in the navbar.
    const buttons = screen.getAllByRole('button');
    const logoutBtn = buttons.find((b) =>
      b.className.includes('hover:text-red-500')
    );
    expect(logoutBtn).toBeTruthy();

    await user.click(logoutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
