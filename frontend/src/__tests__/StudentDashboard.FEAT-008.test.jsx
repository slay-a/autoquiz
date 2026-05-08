import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import StudentDashboard from '../pages/student/Dashboard';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock supabase
const mockGetSession = vi.fn();
const mockFrom = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
    from: (table) => mockFrom(table),
  },
}));

// Mock fetch
global.fetch = vi.fn();

function renderDashboard() {
  return render(
    <BrowserRouter>
      <StudentDashboard />
    </BrowserRouter>
  );
}

describe('StudentDashboard - FEAT-008 Quiz Sharing', () => {
  const mockUser = {
    id: 'student-123',
    email: 'student@example.com',
  };

  const mockProfile = {
    full_name: 'Jane Student',
    role: 'student',
  };

  const mockToken = 'mock-jwt-token';

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

    // Default Supabase mock
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();

    mockFrom.mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      order: mockOrder,
    });

    mockSelect.mockReturnValue({
      eq: mockEq,
      order: mockOrder,
    });

    mockEq.mockReturnValue({
      order: mockOrder,
    });

    mockOrder.mockResolvedValue({
      data: [],
    });

    // Default fetch mock — Dashboard.jsx fires 5 parallel fetches on mount:
    //   GET /quiz/my, /flashcards/my, /classes/student/classes,
    //   /classes/student/content, /notes/my
    // The shared-quizzes payload arrives in /classes/student/content.
    // Tests override this implementation when they need to seed quizzes.
    global.fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/classes/student/content')) {
        return Promise.resolve({ ok: true, json: async () => ({ quizzes: [], notes: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  });

  // Helper for tests that seed shared-quiz data on /classes/student/content
  function mockContentResponse({ quizzes = [], notes = [] }) {
    global.fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/classes/student/content')) {
        return Promise.resolve({ ok: true, json: async () => ({ quizzes, notes }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  }

  // ── AC-8.1.3: Only shared quizzes appear ──────────────────────────

  describe('AC-8.1.3: Only is_shared=true quizzes from GET /classes/student/content are displayed', () => {
    it('displays shared quizzes from joined classes', async () => {
      const sharedQuiz1 = {
        id: 'quiz-shared-1',
        title: 'Math Quiz',
        topic: 'Algebra',
        difficulty: 'medium',
        questions: [{}, {}],
        created_at: '2026-04-10T10:00:00Z',
        className: 'Math 101',
      };

      const sharedQuiz2 = {
        id: 'quiz-shared-2',
        title: 'Physics Quiz',
        topic: 'Mechanics',
        difficulty: 'hard',
        questions: [{}, {}, {}],
        created_at: '2026-04-11T10:00:00Z',
        className: 'Physics 101',
      };

      mockContentResponse({ quizzes: [sharedQuiz1, sharedQuiz2] });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Switch to class quizzes tab
      const classQuizzesTab = screen.getByRole('button', { name: /class quizzes/i });
      await userEvent.click(classQuizzesTab);

      // Verify both shared quizzes are displayed
      await waitFor(() => {
        expect(screen.getByText('Math Quiz')).toBeInTheDocument();
        expect(screen.getByText('Physics Quiz')).toBeInTheDocument();
      });

      // Verify className labels are displayed
      expect(screen.getByText(/math 101/i)).toBeInTheDocument();
      expect(screen.getByText(/physics 101/i)).toBeInTheDocument();
    });

    it('displays empty state when no shared quizzes exist', async () => {
      mockContentResponse({ quizzes: [], notes: [] });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Switch to class quizzes tab
      const classQuizzesTab = screen.getByRole('button', { name: /class quizzes/i });
      await userEvent.click(classQuizzesTab);

      // Verify empty state is shown
      await waitFor(() => {
        expect(screen.getByText(/no quizzes/i)).toBeInTheDocument();
      });
    });

    it('fetches class content from GET /classes/student/content', async () => {
      mockContentResponse({ quizzes: [], notes: [] });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      // Verify fetch was called with correct endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/classes/student/content',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockToken}`,
          }),
        })
      );
    });
  });

  describe('Quizzes from non-joined classes are absent', () => {
    it('does not display quizzes from classes student has not joined', async () => {
      // Backend should already filter quizzes by class membership
      // This test verifies frontend displays only what backend returns

      const joinedClassQuiz = {
        id: 'quiz-joined',
        title: 'Math Quiz',
        topic: 'Algebra',
        difficulty: 'medium',
        questions: [{}],
        created_at: '2026-04-10T10:00:00Z',
        className: 'Math 101',
      };

      mockContentResponse({ quizzes: [joinedClassQuiz] });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const classQuizzesTab = screen.getByRole('button', { name: /class quizzes/i });
      await userEvent.click(classQuizzesTab);

      // Verify only the joined class quiz is displayed
      await waitFor(() => {
        expect(screen.getByText('Math Quiz')).toBeInTheDocument();
        expect(screen.getByText(/math 101/i)).toBeInTheDocument();
      });

      // Verify no other quizzes are displayed
      const studyButtons = screen.getAllByRole('link', { name: /study/i });
      expect(studyButtons.length).toBe(1);
    });
  });

  describe('Quiz cards display correctly', () => {
    it('renders quiz with question count, difficulty, and class name', async () => {
      const quiz = {
        id: 'quiz-1',
        title: 'Calculus Quiz',
        topic: 'Derivatives',
        difficulty: 'hard',
        questions: [{}, {}, {}, {}, {}],
        created_at: '2026-04-12T10:00:00Z',
        className: 'Math 201',
      };

      mockContentResponse({ quizzes: [quiz] });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const classQuizzesTab = screen.getByRole('button', { name: /class quizzes/i });
      await userEvent.click(classQuizzesTab);

      await waitFor(() => {
        expect(screen.getByText('Calculus Quiz')).toBeInTheDocument();
      });

      // Verify metadata line: "5 questions · hard · Math 201"
      expect(screen.getByText(/5 questions · hard · math 201/i)).toBeInTheDocument();
    });

    it('quiz link points to /quiz/:id', async () => {
      const quiz = {
        id: 'quiz-abc',
        title: 'Test Quiz',
        topic: 'Testing',
        difficulty: 'easy',
        questions: [{}],
        created_at: '2026-04-10T10:00:00Z',
        className: 'Test Class',
      };

      mockContentResponse({ quizzes: [quiz] });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const classQuizzesTab = screen.getByRole('button', { name: /class quizzes/i });
      await userEvent.click(classQuizzesTab);

      await waitFor(() => {
        expect(screen.getByText('Test Quiz')).toBeInTheDocument();
      });

      // Verify link
      const studyLink = screen.getByRole('link', { name: /study/i });
      expect(studyLink).toHaveAttribute('href', '/quiz/quiz-abc');
    });
  });

  describe('Integration: Multiple quizzes from multiple classes', () => {
    it('displays quizzes from multiple joined classes', async () => {
      const quizzes = [
        {
          id: 'quiz-math',
          title: 'Algebra Quiz',
          topic: 'Algebra',
          difficulty: 'medium',
          questions: [{}],
          created_at: '2026-04-12T10:00:00Z',
          className: 'Math 101',
        },
        {
          id: 'quiz-physics',
          title: 'Mechanics Quiz',
          topic: 'Physics',
          difficulty: 'hard',
          questions: [{}, {}],
          created_at: '2026-04-11T10:00:00Z',
          className: 'Physics 101',
        },
        {
          id: 'quiz-chem',
          title: 'Chemistry Quiz',
          topic: 'Organic Chemistry',
          difficulty: 'easy',
          questions: [{}, {}, {}],
          created_at: '2026-04-10T10:00:00Z',
          className: 'Chemistry 101',
        },
      ];

      mockContentResponse({ quizzes });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
      });

      const classQuizzesTab = screen.getByRole('button', { name: /class quizzes/i });
      await userEvent.click(classQuizzesTab);

      // Verify all quizzes are displayed
      await waitFor(() => {
        expect(screen.getByText('Algebra Quiz')).toBeInTheDocument();
        expect(screen.getByText('Mechanics Quiz')).toBeInTheDocument();
        expect(screen.getByText('Chemistry Quiz')).toBeInTheDocument();
      });

      // Verify all class names are shown
      expect(screen.getByText(/math 101/i)).toBeInTheDocument();
      expect(screen.getByText(/physics 101/i)).toBeInTheDocument();
      expect(screen.getByText(/chemistry 101/i)).toBeInTheDocument();

      // Verify correct number of study links
      const studyLinks = screen.getAllByRole('link', { name: /study/i });
      expect(studyLinks.length).toBe(3);
    });
  });
});
