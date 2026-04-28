import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ClassView from '../pages/instructor/ClassView';

const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-jwt-token' } },
      }),
    },
  },
}));

vi.mock('../components/Upload', () => ({ default: () => <div>Upload</div> }));
vi.mock('../components/TopicSearch', () => ({ default: () => <div>TopicSearch</div> }));

const CLASS_DETAIL = {
  id: 'class-123',
  name: 'Physics 101',
  description: 'Introduction to Physics',
  class_code: 'PHY101',
  instructor_id: 'instructor-123',
  created_at: '2026-04-11T10:00:00Z',
  members: [],
};

const SHARED_QUIZ = {
  id: 'quiz-shared',
  title: 'Shared Quiz',
  topic: 'Mechanics',
  difficulty: 'medium',
  questions: [{}],
  created_at: '2026-04-10T10:00:00Z',
  class_id: 'class-123',
  is_shared: true,
};

const UNSHARED_QUIZ = {
  id: 'quiz-unshared',
  title: 'Unshared Quiz',
  topic: 'Thermodynamics',
  difficulty: 'easy',
  questions: [{}],
  created_at: '2026-04-09T10:00:00Z',
  class_id: 'class-123',
  is_shared: false,
};

function mockFetch(quizzes = []) {
  global.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('/quizzes/') && url.includes('/share')) {
      const quiz = quizzes.find(q => url.includes(q.id));
      const updated = quiz ? { ...quiz, is_shared: !quiz.is_shared } : null;
      return Promise.resolve({ ok: true, json: async () => updated });
    }
    if (url.includes('/quizzes/')) {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (url.endsWith('/quizzes')) {
      return Promise.resolve({ ok: true, json: async () => quizzes });
    }
    if (url.endsWith('/files')) return Promise.resolve({ ok: true, json: async () => [] });
    if (url.endsWith('/notes')) return Promise.resolve({ ok: true, json: async () => [] });
    if (url.includes('/classes/class-123')) {
      return Promise.resolve({ ok: true, json: async () => CLASS_DETAIL });
    }
    return Promise.resolve({ ok: true, json: async () => [] });
  });
}

function renderClassView() {
  return render(
    <MemoryRouter initialEntries={['/instructor/class/class-123']}>
      <Routes>
        <Route path="/instructor/class/:id" element={<ClassView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ClassView - FEAT-008 Quiz Sharing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'instructor-123', email: 'instructor@example.com' },
      profile: { full_name: 'John Instructor', role: 'instructor' },
      loading: false,
    });
    global.confirm = vi.fn(() => true);
  });

  describe('AC-8.1.1: Share toggle renders with correct initial state', () => {
    it('displays shared quiz with "Shared" visual state', async () => {
      mockFetch([SHARED_QUIZ]);
      renderClassView();

      await waitFor(() => expect(screen.getByText('Physics 101')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('button', { name: /^Quizzes$/i }));

      await waitFor(() => expect(screen.getByText('Shared Quiz')).toBeInTheDocument());

      const shareBtn = screen.getByRole('button', { name: /shared/i });
      expect(shareBtn).toBeInTheDocument();
      expect(shareBtn.className).toContain('bg-emerald-50');
    });

    it('displays unshared quiz with "Share" visual state', async () => {
      mockFetch([UNSHARED_QUIZ]);
      renderClassView();

      await waitFor(() => expect(screen.getByText('Physics 101')).toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: /^Quizzes$/i }));
      await waitFor(() => expect(screen.getByText('Unshared Quiz')).toBeInTheDocument());

      const shareBtn = screen.getByRole('button', { name: /^share$/i });
      expect(shareBtn).toBeInTheDocument();
      expect(shareBtn.className).toContain('bg-gray-50');
    });
  });

  describe('AC-8.1.2: Clicking toggle calls backend PATCH and updates UI', () => {
    it('toggles is_shared from false to true and updates UI', async () => {
      const user = userEvent.setup();
      mockFetch([UNSHARED_QUIZ]);
      renderClassView();

      await waitFor(() => expect(screen.getByText('Physics 101')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /^Quizzes$/i }));
      await waitFor(() => expect(screen.getByText('Unshared Quiz')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /^share$/i }));

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/quizzes/quiz-unshared/share'),
        expect.objectContaining({ method: 'PATCH' })
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /shared/i })).toBeInTheDocument();
      });
    });

    it('toggles is_shared from true to false and updates UI', async () => {
      const user = userEvent.setup();
      mockFetch([SHARED_QUIZ]);
      renderClassView();

      await waitFor(() => expect(screen.getByText('Physics 101')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /^Quizzes$/i }));
      await waitFor(() => expect(screen.getByText('Shared Quiz')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /shared/i }));

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/quizzes/quiz-shared/share'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  describe('AC-8.1.4: Quizzes count in header reflects total quizzes', () => {
    it('shows total quiz count (not just shared) in header stat', async () => {
      mockFetch([SHARED_QUIZ, UNSHARED_QUIZ]);
      renderClassView();

      await waitFor(() => expect(screen.getByText('Physics 101')).toBeInTheDocument());

      await waitFor(() => {
        const label = screen.getByText('Quizzes');
        expect(label).toBeInTheDocument();
        expect(label.previousElementSibling.textContent).toBe('2');
      });
    });

    it('updates quiz count after a new quiz is generated', async () => {
      mockFetch([UNSHARED_QUIZ]);
      renderClassView();

      await waitFor(() => {
        const label = screen.getByText('Quizzes');
        expect(label.previousElementSibling.textContent).toBe('1');
      });
    });
  });

  describe('AC-8.3.1, AC-8.3.2: Delete quiz', () => {
    it('clicking delete calls backend DELETE and removes quiz from list', async () => {
      const user = userEvent.setup();
      mockFetch([SHARED_QUIZ]);
      renderClassView();

      await waitFor(() => expect(screen.getByText('Physics 101')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /^Quizzes$/i }));
      await waitFor(() => expect(screen.getByText('Shared Quiz')).toBeInTheDocument());

      const trashBtn = screen
        .getAllByRole('button')
        .find(btn => btn.querySelector('svg') && btn.className.includes('text-gray-300'));
      await user.click(trashBtn);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/quizzes/quiz-shared'),
        expect.objectContaining({ method: 'DELETE' })
      );

      await waitFor(() => {
        expect(screen.queryByText('Shared Quiz')).not.toBeInTheDocument();
      });
    });

    it('does not delete if user cancels confirmation', async () => {
      const user = userEvent.setup();
      global.confirm = vi.fn(() => false);
      mockFetch([SHARED_QUIZ]);
      renderClassView();

      await waitFor(() => expect(screen.getByText('Physics 101')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /^Quizzes$/i }));
      await waitFor(() => expect(screen.getByText('Shared Quiz')).toBeInTheDocument());

      const trashBtn = screen
        .getAllByRole('button')
        .find(btn => btn.querySelector('svg') && btn.className.includes('text-gray-300'));
      await user.click(trashBtn);

      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/quizzes/quiz-shared'),
        expect.objectContaining({ method: 'DELETE' })
      );

      expect(screen.getByText('Shared Quiz')).toBeInTheDocument();
    });
  });
});
