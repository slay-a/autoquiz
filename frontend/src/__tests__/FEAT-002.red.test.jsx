/**
 * FEAT-002 Red-phase frontend tests — pins gaps identified in V&V triage.
 *
 * B-7: Clipboard tests fail because:
 *   a) screen.getAllByText('PHY101').find(el => el.tagName === 'BUTTON') returns undefined
 *      — text nodes inside a button are not the button element.
 *   b) The copy button lacks an accessible aria-label (DESIGN.md §15.7 accessibility).
 *
 * After the prototyper:
 *   - Adds aria-label to the copy button → B-7b passes
 *   - The button is now findable by role → existing test AC-2.3.3 now works
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ClassView from '../pages/instructor/ClassView';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock supabase
const mockGetSession = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
    from: (...args) => mockSupabaseFrom(...args),
  },
}));

// Mock fetch
global.fetch = vi.fn();

const mockUser = { id: 'instructor-123', email: 'instructor@example.com' };
const mockProfile = { full_name: 'John Instructor', role: 'instructor' };
const mockToken = 'mock-jwt-token';

const mockClassDetail = {
  id: 'class-123',
  name: 'Physics 101',
  description: 'Introduction to Physics',
  class_code: 'PHY101',
  instructor_id: 'instructor-123',
  created_at: '2026-04-11T10:00:00Z',
  members: [],
};

function renderClassView(classId = 'class-123') {
  return render(
    <MemoryRouter initialEntries={[`/instructor/class/${classId}`]}>
      <Routes>
        <Route path="/instructor/class/:id" element={<ClassView />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: mockUser, profile: mockProfile, loading: false });
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: mockToken } },
  });

  // Class-detail endpoint matched by exact suffix so /files, /quizzes,
  // /notes sub-routes fall through to [] (otherwise ClassView crashes
  // calling .find on a class-detail object).
  global.fetch.mockImplementation((url) => {
    if (/\/classes\/class-123$/.test(url)) {
      return Promise.resolve({ ok: true, json: async () => mockClassDetail });
    }
    return Promise.resolve({ ok: true, json: async () => [] });
  });

  mockSupabaseFrom.mockImplementation(() => {
    const mockChain = {
      select: vi.fn(() => mockChain),
      eq: vi.fn(() => mockChain),
      order: vi.fn(() => ({ data: [], error: null })),
      delete: vi.fn(() => mockChain),
    };
    return mockChain;
  });
});

describe('FEAT-002 Red: B-7 — Copy button accessibility', () => {
  it('B-7a: copy button is findable by role="button" with accessible name (aria-label)', async () => {
    /**
     * B-7: The existing test finds `screen.getAllByText('PHY101').find(el => el.tagName === 'BUTTON')`
     * which returns undefined because text inside <button> is a text node, not the button element.
     *
     * After prototyper adds aria-label="Copy class code PHY101" to the copy button,
     * this test PASSES because the button is findable by role + accessible name.
     *
     * This test FAILS before the fix: the copy button has no aria-label,
     * so getByRole('button', { name: /copy class code/i }) throws.
     */
    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    // After the fix: this must succeed (button has aria-label)
    // Before the fix: this throws "unable to find role=button with name /copy class code/i"
    const copyButton = screen.getByRole('button', { name: /copy class code PHY101/i });
    expect(copyButton).toBeInTheDocument();
  });

  it('B-7b: copy button has aria-label for screen reader accessibility (DESIGN.md §15.7)', async () => {
    /**
     * B-7: DESIGN.md §15.7 accessibility checklist: "every button has an accessible name".
     * The copy button in ClassView lacks an aria-label — the only accessible name is the
     * class code text ("PHY101") which is non-descriptive without context.
     *
     * After fix: aria-label="Copy class code PHY101" satisfies the requirement.
     * This test FAILS if the copy button only has class code text (no aria-label prefix).
     *
     * Specifically: queryByRole('button', { name: /copy class code/i }) must return
     * a non-null element — which requires aria-label containing "copy class code".
     */
    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    // Must find a button whose accessible name includes "copy class code"
    // (not just "PHY101" which is the raw class code with no context)
    const copyButton = screen.queryByRole('button', { name: /copy class code/i });
    expect(copyButton).not.toBeNull();
    expect(copyButton).toBeInTheDocument();
  });
});
