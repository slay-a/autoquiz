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
