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

function renderClassView(classId = 'class-123') {
  return render(
    <MemoryRouter initialEntries={[`/instructor/class/${classId}`]}>
      <Routes>
        <Route path="/instructor/class/:id" element={<ClassView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ClassView - FEAT-008 Quiz Sharing', () => {
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

  const mockSharedQuiz = {
    id: 'quiz-shared',
    title: 'Shared Quiz',
    topic: 'Mechanics',
    difficulty: 'medium',
    questions: [{ q: '1+1', a: ['2', '3'], correct: 0 }],
    created_at: '2026-04-10T10:00:00Z',
    class_id: 'class-123',
    is_shared: true,
  };

  const mockUnsharedQuiz = {
    id: 'quiz-unshared',
    title: 'Unshared Quiz',
    topic: 'Thermodynamics',
    difficulty: 'easy',
    questions: [{ q: '2+2', a: ['4', '5'], correct: 0 }],
    created_at: '2026-04-09T10:00:00Z',
    class_id: 'class-123',
    is_shared: false,
  };

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

    // Default fetch mock
    global.fetch.mockImplementation((url) => {
      if (url.includes('/classes/class-123')) {
        return Promise.resolve({ ok: true, json: async () => mockClassDetail });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    // Default Supabase mock
    mockSupabaseFrom.mockImplementation((table) => {
      const mockChain = {
        select: vi.fn(() => mockChain),
        eq: vi.fn(() => mockChain),
        order: vi.fn(() => mockChain),
        delete: vi.fn(() => mockChain),
        update: vi.fn(() => mockChain),
        single: vi.fn(() => ({ data: null, error: null })),
      };
      return mockChain;
    });
  });

  // ── Story 8.1: Share a quiz with a class ──────────────────────────

  describe('AC-8.1.1: Share toggle renders with correct initial state', () => {
    it('displays shared quiz with "Shared" visual state', async () => {
      // Mock quizzes fetch with one shared quiz
      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => {
            if (table === 'saved_quizzes') {
              return { data: [mockSharedQuiz], error: null };
            }
            return { data: [], error: null };
          }),
          delete: vi.fn(() => mockChain),
          update: vi.fn(() => mockChain),
          single: vi.fn(() => ({ data: null, error: null })),
        };
        return mockChain;
      });

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      // Navigate to Quizzes tab
      const quizzesTab = screen.getByRole('button', { name: /^Quizzes$/i });
      await userEvent.click(quizzesTab);

      // Verify shared quiz is displayed
      await waitFor(() => {
        expect(screen.getByText('Shared Quiz')).toBeInTheDocument();
      });

      // Verify the toggle button shows "Shared" state
      const shareButton = screen.getByRole('button', { name: /shared/i });
      expect(shareButton).toBeInTheDocument();
      expect(shareButton).toHaveClass('bg-emerald-50');
    });

    it('displays unshared quiz with "Share" visual state', async () => {
      // Mock quizzes fetch with one unshared quiz
      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => {
            if (table === 'saved_quizzes') {
              return { data: [mockUnsharedQuiz], error: null };
            }
            return { data: [], error: null };
          }),
          delete: vi.fn(() => mockChain),
          update: vi.fn(() => mockChain),
          single: vi.fn(() => ({ data: null, error: null })),
        };
        return mockChain;
      });

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      // Navigate to Quizzes tab
      const quizzesTab = screen.getByRole('button', { name: /^Quizzes$/i });
      await userEvent.click(quizzesTab);

      // Verify unshared quiz is displayed
      await waitFor(() => {
        expect(screen.getByText('Unshared Quiz')).toBeInTheDocument();
      });

      // Verify the toggle button shows "Share" state (not "Shared")
      const shareButton = screen.getByRole('button', { name: /^share$/i });
      expect(shareButton).toBeInTheDocument();
      expect(shareButton).toHaveClass('bg-gray-50');
    });
  });

  describe('AC-8.1.2: Clicking toggle calls Supabase update', () => {
    it('toggles is_shared from false to true and updates UI', async () => {
      const user = userEvent.setup();

      // Track Supabase update calls
      let updatePayload = null;
      const mockUpdate = vi.fn((payload) => {
        updatePayload = payload;
        const mockChain = {
          eq: vi.fn(() => mockChain),
          select: vi.fn(() => mockChain),
          single: vi.fn(() => ({ data: { ...mockUnsharedQuiz, is_shared: true }, error: null })),
        };
        return mockChain;
      });

      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => {
            if (table === 'saved_quizzes') {
              return { data: [mockUnsharedQuiz], error: null };
            }
            return { data: [], error: null };
          }),
          delete: vi.fn(() => mockChain),
          update: mockUpdate,
          single: vi.fn(() => ({ data: null, error: null })),
        };
        return mockChain;
      });

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      // Navigate to Quizzes tab
      const quizzesTab = screen.getByRole('button', { name: /^Quizzes$/i });
      await user.click(quizzesTab);

      await waitFor(() => {
        expect(screen.getByText('Unshared Quiz')).toBeInTheDocument();
      });

      // Click the share toggle
      const shareButton = screen.getByRole('button', { name: /^share$/i });
      await user.click(shareButton);

      // Verify Supabase update was called with correct payload
      expect(mockUpdate).toHaveBeenCalledWith({ is_shared: true });

      // Verify UI flipped to "Shared" state
      await waitFor(() => {
        const sharedButton = screen.getByRole('button', { name: /shared/i });
        expect(sharedButton).toBeInTheDocument();
      });
    });

    it('toggles is_shared from true to false and updates UI', async () => {
      const user = userEvent.setup();

      let updatePayload = null;
      const mockUpdate = vi.fn((payload) => {
        updatePayload = payload;
        const mockChain = {
          eq: vi.fn(() => mockChain),
          select: vi.fn(() => mockChain),
          single: vi.fn(() => ({ data: { ...mockSharedQuiz, is_shared: false }, error: null })),
        };
        return mockChain;
      });

      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => {
            if (table === 'saved_quizzes') {
              return { data: [mockSharedQuiz], error: null };
            }
            return { data: [], error: null };
          }),
          delete: vi.fn(() => mockChain),
          update: mockUpdate,
          single: vi.fn(() => ({ data: null, error: null })),
        };
        return mockChain;
      });

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      const quizzesTab = screen.getByRole('button', { name: /^Quizzes$/i });
      await user.click(quizzesTab);

      await waitFor(() => {
        expect(screen.getByText('Shared Quiz')).toBeInTheDocument();
      });

      // Click the toggle to unshare
      const sharedButton = screen.getByRole('button', { name: /shared/i });
      await user.click(sharedButton);

      // Verify update payload
      expect(mockUpdate).toHaveBeenCalledWith({ is_shared: false });

      // Verify UI flipped back to "Share"
      await waitFor(() => {
        const shareButton = screen.getByRole('button', { name: /^share$/i });
        expect(shareButton).toBeInTheDocument();
      });
    });
  });

  describe('AC-8.1.4: sharedQuizzes count reflects is_shared state', () => {
    it('displays correct count when one quiz is shared', async () => {
      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => {
            if (table === 'saved_quizzes') {
              return { data: [mockSharedQuiz, mockUnsharedQuiz], error: null };
            }
            return { data: [], error: null };
          }),
          delete: vi.fn(() => mockChain),
          update: vi.fn(() => mockChain),
          single: vi.fn(() => ({ data: null, error: null })),
        };
        return mockChain;
      });

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      // The header shows "Shared Quizzes" count
      // Line 525 in ClassView.jsx: <p className="text-xl font-bold text-indigo-700">{sharedQuizzes}</p>
      // Line 526: <p className="text-xs text-gray-400 mt-0.5">Shared Quizzes</p>
      await waitFor(() => {
        const sharedQuizzesLabel = screen.getByText('Shared Quizzes');
        expect(sharedQuizzesLabel).toBeInTheDocument();

        // Find the count (text-xl bold text-indigo-700 directly above the label)
        const countElement = sharedQuizzesLabel.previousElementSibling;
        expect(countElement.textContent).toBe('1');
      });
    });

    it('displays zero when no quizzes are shared', async () => {
      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => {
            if (table === 'saved_quizzes') {
              return { data: [mockUnsharedQuiz], error: null };
            }
            return { data: [], error: null };
          }),
          delete: vi.fn(() => mockChain),
          update: vi.fn(() => mockChain),
          single: vi.fn(() => ({ data: null, error: null })),
        };
        return mockChain;
      });

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      await waitFor(() => {
        const sharedQuizzesLabel = screen.getByText('Shared Quizzes');
        const countElement = sharedQuizzesLabel.previousElementSibling;
        expect(countElement.textContent).toBe('0');
      });
    });
  });

  // ── Story 8.3: Delete a shared quiz ───────────────────────────────

  describe('AC-8.3.1, AC-8.3.2: Delete button removes quiz from list', () => {
    it('displays delete button for each quiz', async () => {
      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => {
            if (table === 'saved_quizzes') {
              return { data: [mockSharedQuiz], error: null };
            }
            return { data: [], error: null };
          }),
          delete: vi.fn(() => mockChain),
          update: vi.fn(() => mockChain),
          single: vi.fn(() => ({ data: null, error: null })),
        };
        return mockChain;
      });

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      const quizzesTab = screen.getByRole('button', { name: /^Quizzes$/i });
      await userEvent.click(quizzesTab);

      await waitFor(() => {
        expect(screen.getByText('Shared Quiz')).toBeInTheDocument();
      });

      // The delete button is a Trash2 icon button
      // Line 587-589 in ClassView.jsx
      const deleteButtons = screen.getAllByRole('button');
      // Find the one with a trash icon (small invisible button)
      const trashButton = deleteButtons.find(btn =>
        btn.querySelector('svg') && btn.className.includes('text-gray-300')
      );
      expect(trashButton).toBeDefined();
    });

    it('clicking delete removes quiz from displayed list', async () => {
      const user = userEvent.setup();

      // Mock confirm dialog to always return true
      global.confirm = vi.fn(() => true);

      const mockDelete = vi.fn(() => {
        const mockChain = {
          eq: vi.fn(() => mockChain),
        };
        return mockChain;
      });

      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => {
            if (table === 'saved_quizzes') {
              return { data: [mockSharedQuiz], error: null };
            }
            return { data: [], error: null };
          }),
          delete: mockDelete,
          update: vi.fn(() => mockChain),
          single: vi.fn(() => ({ data: null, error: null })),
        };
        return mockChain;
      });

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      const quizzesTab = screen.getByRole('button', { name: /^Quizzes$/i });
      await user.click(quizzesTab);

      await waitFor(() => {
        expect(screen.getByText('Shared Quiz')).toBeInTheDocument();
      });

      // Find and click the delete button
      const deleteButtons = screen.getAllByRole('button');
      const trashButton = deleteButtons.find(btn =>
        btn.querySelector('svg') && btn.className.includes('text-gray-300')
      );
      await user.click(trashButton);

      // Verify Supabase delete was called
      expect(mockDelete).toHaveBeenCalled();

      // Verify quiz is removed from the list
      await waitFor(() => {
        expect(screen.queryByText('Shared Quiz')).not.toBeInTheDocument();
      });

      // Verify empty state is shown
      await waitFor(() => {
        expect(screen.getByText(/No quizzes yet/i)).toBeInTheDocument();
      });
    });

    it('does not delete quiz if user cancels confirmation', async () => {
      const user = userEvent.setup();

      // Mock confirm to return false
      global.confirm = vi.fn(() => false);

      const mockDelete = vi.fn();

      mockSupabaseFrom.mockImplementation((table) => {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => {
            if (table === 'saved_quizzes') {
              return { data: [mockSharedQuiz], error: null };
            }
            return { data: [], error: null };
          }),
          delete: mockDelete,
          update: vi.fn(() => mockChain),
          single: vi.fn(() => ({ data: null, error: null })),
        };
        return mockChain;
      });

      renderClassView();

      await waitFor(() => {
        expect(screen.getByText('Physics 101')).toBeInTheDocument();
      });

      const quizzesTab = screen.getByRole('button', { name: /^Quizzes$/i });
      await user.click(quizzesTab);

      await waitFor(() => {
        expect(screen.getByText('Shared Quiz')).toBeInTheDocument();
      });

      // Click delete button
      const deleteButtons = screen.getAllByRole('button');
      const trashButton = deleteButtons.find(btn =>
        btn.querySelector('svg') && btn.className.includes('text-gray-300')
      );
      await user.click(trashButton);

      // Verify delete was NOT called
      expect(mockDelete).not.toHaveBeenCalled();

      // Verify quiz is still in the list
      expect(screen.getByText('Shared Quiz')).toBeInTheDocument();
    });
  });
});
