import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
const mockClipboardWriteText = vi.fn();

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

function renderClassView(classId = 'class-123') {
  return render(
    <MemoryRouter initialEntries={[`/instructor/class/${classId}`]}>
      <Routes>
        <Route path="/instructor/class/:id" element={<ClassView />} />
      </Routes>
    </MemoryRouter>
  );
}

// AC-2.3.4 (composite): The class detail page provides access to file upload,
// notes creation, and quiz sharing. No single test in this file covers all
// three at once. Coverage is composed:
//   - File upload / re-access list — see "ClassView - FEAT-005 Story 5.3" suite below
//   - Notes creation             — see ClassView.FEAT-010.test.jsx
//   - Quiz sharing               — see ClassView.FEAT-008.test.jsx
// A composite end-to-end test for AC-2.3.4 is intentionally not present in
// jsdom; rendering the full ClassView with all three sub-features wired would
// require seeding more state than this file's mocks support. Verified manually
// pre-demo.
describe('ClassView - FEAT-002', () => {
  const mockUser = {
    id: 'instructor-123',
    email: 'instructor@example.com',
  };

  const mockProfile = {
    full_name: 'John Instructor',
    role: 'instructor',
  };

  const mockToken = 'mock-jwt-token';

  const mockClassDetail = {
    id: 'class-123',
    name: 'Physics 101',
    description: 'Introduction to Physics',
    class_code: 'PHY101',
    instructor_id: 'instructor-123',
    created_at: '2026-04-11T10:00:00Z',
    members: [
      {
        student_id: 'student-1',
        full_name: 'Alice Student',
        email: 'alice@example.com',
        joined_at: '2026-04-11T11:00:00Z',
      },
      {
        student_id: 'student-2',
        full_name: 'Bob Student',
        email: 'bob@example.com',
        joined_at: '2026-04-11T11:30:00Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish clipboard mock AFTER vi.clearAllMocks() so the mock impl persists.
    mockClipboardWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockClipboardWriteText,
      },
      writable: true,
      configurable: true,
    });

    mockUseAuth.mockReturnValue({
      user: mockUser,
      profile: mockProfile,
      loading: false,
    });

    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: mockToken,
        },
      },
    });

    // Mock Supabase from() method for files and notes queries
    mockSupabaseFrom.mockImplementation((table) => {
      // Create a chainable mock
      const mockChain = {
        select: vi.fn(() => mockChain),
        eq: vi.fn(() => mockChain),
        order: vi.fn(() => mockChain),
        delete: vi.fn(() => mockChain),
        execute: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      return mockChain;
    });

    // Default: mock all fetch calls. The class-detail endpoint is matched
    // by EXACT suffix so `/classes/class-123/files`, `/classes/class-123/quizzes`,
    // `/classes/class-123/notes` fall through to their own array branches
    // (otherwise ClassView crashes on `files.find` etc.).
    global.fetch.mockImplementation((url) => {
      if (/\/classes\/class-123$/.test(url)) {
        return Promise.resolve({ ok: true, json: async () => mockClassDetail });
      }
      // All other /classes/class-123/* endpoints return [] by default
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  });

  // ── Story 2.3: View class detail ───────────────────────────────

  it('AC-2.3.1: displays class name, class_code, and description', async () => {
    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
      expect(screen.getByText('Introduction to Physics')).toBeInTheDocument();
      expect(screen.getByText('PHY101')).toBeInTheDocument();
    });
  });

  it('AC-2.3.2: displays list of enrolled students', async () => {
    const user = userEvent.setup();
    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    // Click Members tab
    const membersTab = screen.getByRole('button', { name: /members/i });
    await user.click(membersTab);

    // Wait for member list to render
    await waitFor(() => {
      expect(screen.getByText('Alice Student')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByText('Bob Student')).toBeInTheDocument();
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    });
  });

  it('AC-2.3.2: displays member count', async () => {
    renderClassView();

    await waitFor(() => {
      // The member count is displayed in the stats section
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('AC-2.3.3: copy button is accessible and triggers copyCode on click', async () => {
    const user = userEvent.setup();
    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    // AC-2.3.3: copy button is findable by role + accessible name (aria-label added per DESIGN.md §15.7)
    const copyButton = screen.getByRole('button', { name: /copy class code PHY101/i });
    expect(copyButton).toBeInTheDocument();

    // The button renders the class code text as its visible label
    expect(copyButton).toHaveTextContent('PHY101');

    // Click should not throw and should change button label to "Copied..."
    await user.click(copyButton);

    // After click, the aria-label updates to "Copied class code PHY101"
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copied class code PHY101/i })).toBeInTheDocument();
    });
  });

  it('AC-2.3.3: shows visual feedback (aria-label change) after clicking copy button', async () => {
    const user = userEvent.setup();
    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    // Initial state: button has aria-label "Copy class code PHY101"
    const copyButton = screen.getByRole('button', { name: /copy class code PHY101/i });
    expect(copyButton).toBeInTheDocument();

    // After click: aria-label changes to "Copied class code PHY101" (visual feedback)
    await user.click(copyButton);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copied class code PHY101/i })).toBeInTheDocument();
    });
  });

  it('displays empty state when no members enrolled', async () => {
    const emptyClassDetail = {
      ...mockClassDetail,
      members: [],
    };

    global.fetch.mockImplementation((url) => {
      if (/\/classes\/class-123$/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => emptyClassDetail,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    });

    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    // Click on Members tab
    const membersTab = screen.getByRole('button', { name: /members/i });
    await userEvent.click(membersTab);

    // Should show empty state message
    await waitFor(() => {
      expect(screen.getByText(/share code/i)).toBeInTheDocument();
    });
  });

  it('fetches class detail from backend API', async () => {
    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    // Verify the fetch was called with correct URL and auth header
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/classes/class-123',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': `Bearer ${mockToken}`,
        }),
      })
    );
  });

  it('handles description being null', async () => {
    const classWithoutDescription = {
      ...mockClassDetail,
      description: null,
    };

    global.fetch.mockImplementation((url) => {
      if (/\/classes\/class-123$/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => classWithoutDescription,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    });

    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    // Description should not appear in the document
    expect(screen.queryByText('Introduction to Physics')).not.toBeInTheDocument();
  });

  it('handles student profile with missing full_name', async () => {
    const classWithPartialProfiles = {
      ...mockClassDetail,
      members: [
        {
          student_id: 'student-3',
          full_name: null,
          email: 'charlie@example.com',
          joined_at: '2026-04-11T12:00:00Z',
        },
      ],
    };

    global.fetch.mockImplementation((url) => {
      if (/\/classes\/class-123$/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => classWithPartialProfiles,
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    });

    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    // Click Members tab
    const membersTab = screen.getByRole('button', { name: /members/i });
    await userEvent.click(membersTab);

    // Should still display the email
    await waitFor(() => {
      expect(screen.getByText('charlie@example.com')).toBeInTheDocument();
    });
  });
});

describe('ClassView - FEAT-005 Story 5.3 (File Re-Access)', () => {
  /**
   * NOTE: Story 5.3 tests existing instructor behavior that was already implemented.
   * The validator confirmed all ACs pass (see validator report summary).
   *
   * Frontend integration tests for ClassView are complex due to extensive mocking required.
   * The core logic is validated by:
   * 1. Backend tests (class_id insertion, file list scoping) — all passing
   * 2. Code review of ClassView.jsx line 245: query includes .eq("class_id", id)
   * 3. Code review of ClassView.jsx line 245: query includes .eq("processing_jobs.status", "success")
   * 4. V&V validator report confirms ACs 5.3.1-5.3.4 all pass
   *
   * The tests below confirm the component structure and query patterns by code review.
   */

  const mockUser = {
    id: 'instructor-123',
    email: 'instructor@example.com',
  };

  const mockProfile = {
    full_name: 'John Instructor',
    role: 'instructor',
  };

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

  const mockFiles = [
    { file_id: 'file-1', filename: 'lecture.pdf', created_at: '2026-04-01T10:00:00Z' },
    { file_id: 'file-2', filename: 'notes.docx', created_at: '2026-04-02T11:00:00Z' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: mockUser,
      profile: mockProfile,
      loading: false,
    });

    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: mockToken,
        },
      },
    });

    // Class-detail endpoint matched by exact suffix; /files seeded with
    // mockFiles for the AC-5.3 file-picker tests; other sub-endpoints fall
    // through to []. ClassView fetches files via /classes/:id/files (post
    // FEAT-021 layer-boundary migration), not via supabase.from.
    global.fetch.mockImplementation((url) => {
      if (/\/classes\/class-123$/.test(url)) {
        return Promise.resolve({ ok: true, json: async () => mockClassDetail });
      }
      if (/\/classes\/class-123\/files$/.test(url)) {
        return Promise.resolve({ ok: true, json: async () => mockFiles });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  });

  describe('AC-5.3.1, AC-5.3.2: Display successfully processed files', () => {
    it('renders filename and created_at for each file', async () => {
      const user = userEvent.setup();
      renderClassView();

      // Wait for class to load, then switch to Files tab
      await waitFor(() => expect(screen.getByText('Physics 101')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /^Files$/i }));

      await waitFor(() => {
        expect(screen.getByText('lecture.pdf')).toBeInTheDocument();
        expect(screen.getByText('notes.docx')).toBeInTheDocument();
      });

      // created_at is formatted and displayed via "Uploaded ..." label
      const uploadedLabels = screen.getAllByText(/Uploaded/i);
      expect(uploadedLabels.length).toBeGreaterThanOrEqual(2);
    });

    it('scopes file list to class via the /classes/:id/files route (status=success enforced server-side)', async () => {
      // Post FEAT-021 layer-boundary migration, ClassView no longer queries
      // uploaded_files / processing_jobs directly. The /classes/:id/files
      // backend route applies the class_id + status=success filters.
      // Test asserts the frontend hits the correctly-scoped URL.
      const fetchedUrls = [];
      global.fetch.mockImplementation((url) => {
        fetchedUrls.push(url);
        if (/\/classes\/class-123$/.test(url)) {
          return Promise.resolve({ ok: true, json: async () => mockClassDetail });
        }
        if (/\/classes\/class-123\/files$/.test(url)) {
          return Promise.resolve({ ok: true, json: async () => mockFiles });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      renderClassView();

      await waitFor(() => {
        expect(
          fetchedUrls.some((u) => /\/classes\/class-123\/files$/.test(u))
        ).toBe(true);
      });
    });
  });

  describe('AC-5.3.3: Select file for quiz/notes generation', () => {
    it('file picker includes loaded files as selectable options', async () => {
      const user = userEvent.setup();
      renderClassView();

      // Navigate to Generate Quiz tab where the file picker lives
      await waitFor(() => expect(screen.getByText('Physics 101')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Generate Quiz/i }));

      // Files appear as <option> elements in the generation file picker
      await waitFor(() => {
        const fileOptions = screen.getAllByRole('option', { name: 'lecture.pdf' });
        expect(fileOptions.length).toBeGreaterThan(0);
      });

      // Selecting the file updates the picker value
      const fileOption = screen.getAllByRole('option', { name: 'lecture.pdf' })[0];
      const filePicker = fileOption.closest('select');
      fireEvent.change(filePicker, { target: { value: 'file-1' } });
      expect(filePicker.value).toBe('file-1');
    });
  });

  describe('AC-5.3.4: File list scoped to class', () => {
    it('GET /classes/:id/files uses the class id from the URL param, not a hardcoded value', async () => {
      // Post FEAT-021, the file list is fetched per-class via
      // /classes/:id/files. This test renders two different class IDs and
      // verifies each triggers a fetch keyed on its own class_id.
      const seenUrls = new Set();
      global.fetch.mockImplementation((url) => {
        seenUrls.add(url);
        if (/\/classes\/[^/]+$/.test(url)) {
          return Promise.resolve({ ok: true, json: async () => mockClassDetail });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      const { unmount } = renderClassView('class-123');
      await waitFor(() => {
        expect(
          [...seenUrls].some((u) => /\/classes\/class-123\/files$/.test(u))
        ).toBe(true);
      });
      unmount();

      seenUrls.clear();
      mockUseAuth.mockReturnValue({ user: mockUser, profile: mockProfile, loading: false });
      mockGetSession.mockResolvedValue({ data: { session: { access_token: mockToken } } });

      renderClassView('other-class');
      await waitFor(() => {
        expect(
          [...seenUrls].some((u) => /\/classes\/other-class\/files$/.test(u))
        ).toBe(true);
      });
    });
  });

  describe('Empty state', () => {
    it('handles no uploaded files gracefully', async () => {
      // /classes/:id/files returns [] — page must render without crashing.
      global.fetch.mockImplementation((url) => {
        if (/\/classes\/class-123$/.test(url)) {
          return Promise.resolve({ ok: true, json: async () => mockClassDetail });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      // Should not crash — component renders successfully
      expect(screen.queryByText(/lecture1\.pdf/i)).not.toBeInTheDocument();
    });
  });
});
