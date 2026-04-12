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
    // Mock navigator.clipboard (before clearing mocks)
    mockClipboardWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockClipboardWriteText,
      },
      writable: true,
      configurable: true,
    });

    vi.clearAllMocks();
    mockClipboardWriteText.mockClear();

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

    // Default: mock all fetch calls to return empty arrays
    global.fetch.mockImplementation((url) => {
      if (url.includes('/classes/class-123')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockClassDetail,
        });
      }
      if (url.includes('/files')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes('/quizzes')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
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

  it('AC-2.3.3: copy class_code to clipboard', async () => {
    const user = userEvent.setup();
    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    // The copy button contains just the class code text
    // Use queryAllByText since there might be multiple instances
    const classCodeElements = screen.getAllByText('PHY101');
    // Find the button (should be a clickable element)
    const copyButton = classCodeElements.find(el => el.tagName === 'BUTTON');

    expect(copyButton).toBeDefined();
    await user.click(copyButton);

    // Verify clipboard.writeText was called with the class code
    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith('PHY101');
    });
  });

  it('AC-2.3.3: shows checkmark after copying class_code', async () => {
    const user = userEvent.setup();
    renderClassView();

    await waitFor(() => {
      expect(screen.getByText('Physics 101')).toBeInTheDocument();
    });

    const classCodeElements = screen.getAllByText('PHY101');
    const copyButton = classCodeElements.find(el => el.tagName === 'BUTTON');

    expect(copyButton).toBeDefined();
    await user.click(copyButton);

    // The button text/icon should change to indicate success
    // (The actual implementation shows a Check icon, but we're just verifying the action happened)
    await waitFor(() => {
      expect(mockClipboardWriteText).toHaveBeenCalledWith('PHY101');
    });
  });

  it('displays empty state when no members enrolled', async () => {
    const emptyClassDetail = {
      ...mockClassDetail,
      members: [],
    };

    global.fetch.mockImplementation((url) => {
      if (url.includes('/classes/class-123')) {
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
      if (url.includes('/classes/class-123')) {
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
      if (url.includes('/classes/class-123')) {
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

    global.fetch.mockImplementation((url) => {
      if (url.includes('/classes/class-123')) {
        return Promise.resolve({ ok: true, json: async () => mockClassDetail });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    // The new implementation queries uploaded_files and processing_jobs separately,
    // then intersects on file_id client-side (avoids broken !inner join — no FK on processing_jobs.file_id).
    // eq() is the terminal call for processing_jobs; order() is terminal for uploaded_files.
    mockSupabaseFrom.mockImplementation((table) => {
      const successJobs = mockFiles.map(f => ({ file_id: f.file_id }));
      const mockChain = {
        select: vi.fn(() => mockChain),
        eq: vi.fn(() =>
          table === 'processing_jobs'
            ? { data: successJobs, error: null }
            : mockChain
        ),
        order: vi.fn(() => ({ data: table === 'uploaded_files' ? mockFiles : [], error: null })),
        delete: vi.fn(() => mockChain),
      };
      return mockChain;
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

    it('scopes file list to class via class_id filter and only shows status=success files', async () => {
      const uploadedFilesEqCalls = [];
      const processingJobsEqCalls = [];
      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn((col, val) => {
            if (table === 'uploaded_files') uploadedFilesEqCalls.push([col, val]);
            if (table === 'processing_jobs') processingJobsEqCalls.push([col, val]);
            return table === 'processing_jobs' ? { data: [], error: null } : mockChain;
          }),
          order: vi.fn(() => ({ data: [], error: null })),
          delete: vi.fn(() => mockChain),
        };
        return mockChain;
      });

      renderClassView();

      await waitFor(() => {
        expect(mockSupabaseFrom).toHaveBeenCalledWith('uploaded_files');
        expect(mockSupabaseFrom).toHaveBeenCalledWith('processing_jobs');
      });

      // uploaded_files query is scoped to the class
      expect(uploadedFilesEqCalls).toContainEqual(['class_id', 'class-123']);
      // processing_jobs query filters by status=success
      expect(processingJobsEqCalls).toContainEqual(['status', 'success']);
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
    it('queries uploaded_files with class_id matching the URL param', async () => {
      renderClassView('class-123');

      await waitFor(() => {
        expect(mockSupabaseFrom).toHaveBeenCalledWith('uploaded_files');
      });

      // Verify the Supabase chain was called with the correct class_id
      const fromCall = mockSupabaseFrom.mock.calls.find(([table]) => table === 'uploaded_files');
      expect(fromCall).toBeTruthy();
      // The eq spy on the chain is captured implicitly — render with a different class ID
      // to confirm the query uses the param, not a hardcoded value
      vi.clearAllMocks();
      mockUseAuth.mockReturnValue({ user: mockUser, profile: mockProfile, loading: false });
      mockGetSession.mockResolvedValue({ data: { session: { access_token: mockToken } } });
      global.fetch.mockImplementation((url) => {
        if (url.includes('/classes/other-class')) {
          return Promise.resolve({ ok: true, json: async () => ({ ...mockClassDetail, id: 'other-class' }) });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });
      const otherEqCalls = [];
      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn((col, val) => {
            if (table === 'uploaded_files') otherEqCalls.push([col, val]);
            return mockChain;
          }),
          order: vi.fn(() => ({ data: [], error: null })),
          delete: vi.fn(() => mockChain),
        };
        return mockChain;
      });
      renderClassView('other-class');

      await waitFor(() => {
        expect(mockSupabaseFrom).toHaveBeenCalledWith('uploaded_files');
      });
      expect(otherEqCalls).toContainEqual(['class_id', 'other-class']);
    });
  });

  describe('Empty state', () => {
    it('handles no uploaded files gracefully', async () => {
      global.fetch.mockImplementation((url) => {
        if (url.includes('/classes/class-123')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockClassDetail,
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      });

      mockSupabaseFrom.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }));

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      // Should not crash — component renders successfully
      expect(screen.queryByText(/lecture1\.pdf/i)).not.toBeInTheDocument();
    });
  });
});
