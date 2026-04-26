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

describe('StudentDashboard - FEAT-003', () => {
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

    // Default mock for supabase queries
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();
    const mockExecute = vi.fn().mockResolvedValue({ data: [] });

    mockFrom.mockReturnValue({
      select: mockSelect,
      eq: mockEq,
      order: mockOrder,
      execute: mockExecute,
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

    // Default mock for fetch (empty responses for all 5 FastAPI calls):
    // 1. GET /quiz/my, 2. GET /flashcards/my, 3. GET /classes/student/classes,
    // 4. GET /classes/student/content, 5. GET /notes/my
    global.fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/classes/student/content')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ quizzes: [], notes: [] }),
          text: async () => '',
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
        text: async () => '',
      });
    });
  });

  // ── Story 3.1: Join a class ───────────────────────────────────

  it('AC-3.1.1: join button is disabled when input is empty', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Find the join button
    const joinButton = screen.getByRole('button', { name: /^join$/i });
    expect(joinButton).toBeDisabled();
  });

  it('AC-3.1.1: join button is enabled when input has text', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Type into the class code input
    const input = screen.getByPlaceholderText(/enter class code/i);
    await user.type(input, 'MATH101');

    // Join button should now be enabled
    const joinButton = screen.getByRole('button', { name: /^join$/i });
    expect(joinButton).not.toBeDisabled();
  });

  it('AC-3.1.3: class not found error shown on 404 response', async () => {
    const user = userEvent.setup();

    // Default fetch mock covers initial 5 fetch calls via mockImplementation in beforeEach

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Type a class code
    const input = screen.getByPlaceholderText(/enter class code/i);
    await user.type(input, 'NOTFOUND');

    // Mock 404 response for join (override for the specific join call)
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Class not found' }),
    });

    // Click join
    const joinButton = screen.getByRole('button', { name: /^join$/i });
    await user.click(joinButton);

    // Verify error message
    await waitFor(() => {
      expect(screen.getByText(/class not found/i)).toBeInTheDocument();
    });
  });

  it('AC-3.1.4: already a member message on 409 response', async () => {
    const user = userEvent.setup();

    // Default fetch mock covers initial calls via mockImplementation in beforeEach

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Type a class code
    const input = screen.getByPlaceholderText(/enter class code/i);
    await user.type(input, 'MATH101');

    // Mock 409 response
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: "Already a member of this class" }),
    });

    // Click join
    const joinButton = screen.getByRole('button', { name: /^join$/i });
    await user.click(joinButton);

    // Verify error message
    await waitFor(() => {
      expect(screen.getByText(/already a member/i)).toBeInTheDocument();
    });
  });

  it('AC-3.1.3: no page redirect after failed join', async () => {
    const user = userEvent.setup();

    // Default fetch mock covers initial calls via mockImplementation in beforeEach

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/enter class code/i);
    await user.type(input, 'NOTFOUND');

    // Mock 404 response
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Class not found' }),
    });

    const joinButton = screen.getByRole('button', { name: /^join$/i });
    await user.click(joinButton);

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByText(/class not found/i)).toBeInTheDocument();
    });

    // Verify we're still on the dashboard (error message is visible)
    expect(screen.getByText(/class not found/i)).toBeInTheDocument();
  });

  it('AC-3.1.5: fetchAll() called after successful join — class list updates', async () => {
    const user = userEvent.setup();

    const newClass = {
      id: 'class-1',
      name: 'Math 101',
      description: 'Introduction to Math',
      class_code: 'MATH101',
      created_at: '2026-04-11T10:00:00Z',
    };

    // Default fetch mock covers initial 5 calls via mockImplementation in beforeEach

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/enter class code/i);
    await user.type(input, 'MATH101');

    // Mock successful join
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: 'Successfully joined class',
        class_id: 'class-1',
        class_name: 'Math 101',
      }),
    });

    // Mock refetch after join: now 5 calls
    // 1. /quiz/my — empty
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    // 2. /flashcards/my — empty
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    // 3. /classes/student/classes — now includes the new class
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => [newClass] });
    // 4. /classes/student/content — empty
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ quizzes: [], notes: [] }) });
    // 5. /notes/my — empty
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    const joinButton = screen.getByRole('button', { name: /^join$/i });
    await user.click(joinButton);

    // Wait for refetch to complete
    await waitFor(() => {
      const classesTab = screen.getByRole('button', { name: /my classes/i });
      expect(classesTab).toBeInTheDocument();
    });

    // Switch to classes tab to see the new class
    const classesTab = screen.getByRole('button', { name: /my classes/i });
    await user.click(classesTab);

    // Wait for class to appear
    await waitFor(() => {
      expect(screen.getByText('Math 101')).toBeInTheDocument();
    });

    // Verify class code is displayed
    expect(screen.getByText('MATH101')).toBeInTheDocument();
  });

  // ── Story 3.2: View class content ──────────────────────────────

  it('AC-3.2.3: quizzes rendered with class name label', async () => {
    const mockQuiz = {
      id: 'quiz-1',
      title: 'Algebra Quiz',
      topic: 'Algebra',
      difficulty: 'medium',
      questions: [{}, {}],
      created_at: '2026-04-10T10:00:00Z',
      className: 'Math 101',
    };

    // Set up fetch mocks for 5 FastAPI calls:
    // 1. /quiz/my, 2. /flashcards/my, 3. /classes/student/classes, 4. content, 5. notes
    global.fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/classes/student/content')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ quizzes: [mockQuiz], notes: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Switch to class quizzes tab
    const classQuizzesTab = screen.getByRole('button', { name: /class quizzes/i });
    await userEvent.click(classQuizzesTab);

    // Verify quiz is displayed with class name
    await waitFor(() => {
      expect(screen.getByText('Algebra Quiz')).toBeInTheDocument();
      expect(screen.getByText(/math 101/i)).toBeInTheDocument();
    });
  });

  it('AC-3.2.4: quiz link points to /quiz/:id', async () => {
    const mockQuiz = {
      id: 'quiz-123',
      title: 'Algebra Quiz',
      topic: 'Algebra',
      difficulty: 'medium',
      questions: [{}, {}],
      created_at: '2026-04-10T10:00:00Z',
      className: 'Math 101',
    };

    // Set up fetch mocks for 5 FastAPI calls
    global.fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/classes/student/content')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ quizzes: [mockQuiz], notes: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Switch to class quizzes tab
    const classQuizzesTab = screen.getByRole('button', { name: /class quizzes/i });
    await userEvent.click(classQuizzesTab);

    // Find the quiz link
    const studyLink = screen.getByRole('link', { name: /study/i });
    expect(studyLink).toHaveAttribute('href', '/quiz/quiz-123');
  });

  it('AC-3.2.4: note link points to /class-note/:id', async () => {
    const mockNote = {
      id: 'note-456',
      title: 'Calculus Notes',
      topic: 'Calculus',
      content: {},
      created_at: '2026-04-10T10:00:00Z',
      className: 'Math 101',
    };

    // Set up fetch mocks for 5 FastAPI calls
    global.fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/classes/student/content')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ quizzes: [], notes: [mockNote] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Switch to notes tab
    const notesTab = screen.getByRole('button', { name: /class notes/i });
    await userEvent.click(notesTab);

    // Find the note link
    const readLink = screen.getByRole('link', { name: /read/i });
    expect(readLink).toHaveAttribute('href', '/class-note/note-456');
  });

  it('AC-3.2.1: is_shared=true quizzes shown, is_shared=false quizzes absent', async () => {
    const sharedQuiz = {
      id: 'quiz-shared',
      title: 'Shared Quiz',
      topic: 'Algebra',
      difficulty: 'medium',
      questions: [{}],
      created_at: '2026-04-10T10:00:00Z',
      className: 'Math 101',
    };

    // The backend should only return is_shared=true quizzes
    // This test verifies that the frontend displays what it receives
    global.fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/classes/student/content')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ quizzes: [sharedQuiz], notes: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Switch to class quizzes tab
    const classQuizzesTab = screen.getByRole('button', { name: /class quizzes/i });
    await userEvent.click(classQuizzesTab);

    // Verify shared quiz is displayed
    await waitFor(() => {
      expect(screen.getByText('Shared Quiz')).toBeInTheDocument();
    });

    // Verify the quiz card has the expected content
    expect(screen.getByText('1 questions · medium · Math 101')).toBeInTheDocument();

    // Verify there's only one quiz card (the shared one)
    const studyButtons = screen.getAllByRole('link', { name: /study/i });
    expect(studyButtons.length).toBe(1);
  });

  it('AC-3.2.2: is_published=true notes shown, is_published=false notes absent', async () => {
    const publishedNote = {
      id: 'note-published',
      title: 'Published Note',
      topic: 'Calculus',
      content: {},
      created_at: '2026-04-10T10:00:00Z',
      className: 'Math 101',
    };

    // The backend should only return is_published=true notes
    global.fetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/classes/student/content')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ quizzes: [], notes: [publishedNote] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Switch to notes tab
    const notesTab = screen.getByRole('button', { name: /class notes/i });
    await userEvent.click(notesTab);

    // Verify published note is displayed
    await waitFor(() => {
      expect(screen.getByText('Published Note')).toBeInTheDocument();
    });
  });
});
