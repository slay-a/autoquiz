/**
 * Tests for QuizStudy.jsx — FEAT-007 Story 7.3 (Regenerate a quiz).
 *
 * Tests cover:
 * - AC-7.3.1: Regenerate sends POST /quiz/generate with original params AND Authorization header
 * - AC-7.3.2: Regenerated quiz title has (v2) suffix
 * - AC-7.3.3: Page navigates to /quiz/:new_id after regenerate
 *
 * Architecture note (post FEAT-021): QuizStudy fetches via the FastAPI backend
 *   GET  /quiz/:id        → load quiz
 *   POST /quiz/generate   → regenerate questions
 *   POST /quiz/save       → persist the regenerated quiz with (v2) suffix
 * Tests therefore mock fetch (URL-keyed), not the Supabase client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import QuizStudy from '../pages/QuizStudy';

// Mock react-router-dom
const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockUseParams(),
    useNavigate: () => mockNavigate,
  };
});

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock supabase (only auth.getSession is used now — for the bearer token)
const mockGetSession = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    from: vi.fn(),
  },
}));

// Mock QuizView component
vi.mock('../components/QuizView', () => ({
  default: ({ quiz }) => <div data-testid="quiz-view">Quiz: {quiz?.title}</div>,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  ChevronLeft: () => <div data-testid="chevron-left" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  Layers: () => <div data-testid="layers-icon" />,
  Save: () => <div data-testid="save-icon" />,
}));

// Mock fetch globally
global.fetch = vi.fn();

const mockUser = {
  id: 'student-123',
  email: 'student@example.com',
  role: 'student',
};

const mockQuiz = {
  id: 'quiz-123',
  title: 'Biology — Medium',
  topic: 'Biology',
  difficulty: 'Medium',
  file_id: 'file-456',
  class_id: null,
  is_shared: false,
  outside_sources: true,
  questions: [
    {
      question_id: 'q1',
      question: 'What is photosynthesis?',
      type: 'mcq',
      options: [
        { label: 'A', text: 'Cellular respiration' },
        { label: 'B', text: 'Energy production from light' },
        { label: 'C', text: 'Water absorption' },
        { label: 'D', text: 'Nutrient transport' },
      ],
      answer: 'B',
      explanation: 'Photosynthesis converts light into chemical energy.',
    },
    {
      question_id: 'q2',
      question: 'Chloroplasts are found in plant cells.',
      type: 'true_false',
      answer: 'True',
      explanation: 'Chloroplasts are organelles in plant cells.',
    },
  ],
};

const mockRegenResponse = {
  questions: [
    {
      question_id: 'q3',
      question: 'New question',
      type: 'mcq',
      options: [
        { label: 'A', text: 'Option A' },
        { label: 'B', text: 'Option B' },
        { label: 'C', text: 'Option C' },
        { label: 'D', text: 'Option D' },
      ],
      answer: 'A',
      explanation: 'Explanation',
    },
  ],
};

const mockSavedRegenQuiz = {
  id: 'new-quiz-456',
  title: 'Biology — Medium (v2)',
};

const renderQuizStudy = () => {
  return render(
    <BrowserRouter>
      <QuizStudy />
    </BrowserRouter>
  );
};

// URL-keyed default mock — every test starts from this.
function installFetchMock() {
  global.fetch.mockImplementation((url, options) => {
    const method = options?.method ?? 'GET';
    if (method === 'GET' && /\/quiz\/quiz-123$/.test(url)) {
      return Promise.resolve({ ok: true, json: async () => mockQuiz });
    }
    if (method === 'POST' && /\/quiz\/generate$/.test(url)) {
      return Promise.resolve({ ok: true, json: async () => mockRegenResponse });
    }
    if (method === 'POST' && /\/quiz\/save$/.test(url)) {
      return Promise.resolve({ ok: true, json: async () => mockSavedRegenQuiz });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe('QuizStudy Component — Story 7.3 (Regenerate a quiz)', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockUseParams.mockReturnValue({ id: 'quiz-123' });
    mockUseAuth.mockReturnValue({ user: mockUser, loading: false });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token-123' } },
    });

    installFetchMock();
  });

  describe('AC-7.3.1: Regenerate sends POST /quiz/generate with original params AND Authorization header', () => {
    it('sends POST request to /quiz/generate with correct method, headers and body', async () => {
      renderQuizStudy();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Biology — Medium/i })).toBeInTheDocument();
      });

      const regenerateButton = screen.getByRole('button', { name: /Regenerate/i });
      fireEvent.click(regenerateButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/quiz/generate'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              'Authorization': 'Bearer test-token-123',
            }),
            body: expect.any(String),
          })
        );
      });
    });

    it('includes Authorization header in regenerate request', async () => {
      renderQuizStudy();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Biology — Medium/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }));

      await waitFor(() => {
        // Find the /quiz/generate call specifically
        const genCall = global.fetch.mock.calls.find(
          ([u]) => typeof u === 'string' && u.includes('/quiz/generate')
        );
        expect(genCall).toBeDefined();
        expect(genCall[1].headers.Authorization).toBe('Bearer test-token-123');
      });
    });

    it('sends original quiz parameters in request body', async () => {
      renderQuizStudy();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Biology — Medium/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }));

      await waitFor(() => {
        const genCall = global.fetch.mock.calls.find(
          ([u]) => typeof u === 'string' && u.includes('/quiz/generate')
        );
        expect(genCall).toBeDefined();
        const requestBody = JSON.parse(genCall[1].body);
        expect(requestBody.topic).toBe('Biology');
        expect(requestBody.difficulty).toBe('Medium');
        expect(requestBody.num_questions).toBe(2); // length of mockQuiz.questions
        expect(requestBody.file_id).toBe('file-456');
        expect(requestBody.outside_sources).toBe(true);
      });
    });
  });

  describe('AC-7.3.2: Regenerated quiz title has (v2) suffix', () => {
    it('POSTs /quiz/save with title suffixed (v2)', async () => {
      renderQuizStudy();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Biology — Medium/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }));

      await waitFor(() => {
        const saveCall = global.fetch.mock.calls.find(
          ([u]) => typeof u === 'string' && u.includes('/quiz/save')
        );
        expect(saveCall).toBeDefined();
        const body = JSON.parse(saveCall[1].body);
        expect(body.title).toBe('Biology — Medium (v2)');
        expect(body.topic).toBe('Biology');
        expect(body.questions).toEqual(mockRegenResponse.questions);
      });
    });
  });

  describe('AC-7.3.3: Page navigates to /quiz/:new_id after regenerate', () => {
    it('navigates to new quiz URL after successful regenerate', async () => {
      renderQuizStudy();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Biology — Medium/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/quiz/new-quiz-456');
      });
    });
  });
});
