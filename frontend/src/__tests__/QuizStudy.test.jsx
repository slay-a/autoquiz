/**
 * Tests for QuizStudy.jsx — FEAT-007 Story 7.3 (Regenerate a quiz).
 *
 * Tests cover:
 * - AC-7.3.1: Regenerate sends POST /quiz/generate with original params AND Authorization header
 * - AC-7.3.2: Regenerated quiz title has (v2) suffix
 * - AC-7.3.3: Page navigates to /quiz/:new_id after regenerate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, useParams, useNavigate } from 'react-router-dom';
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

// Mock supabase
const mockGetSession = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOr = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
    from: (...args) => mockFrom(...args),
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

const renderQuizStudy = () => {
  return render(
    <BrowserRouter>
      <QuizStudy />
    </BrowserRouter>
  );
};

describe('QuizStudy Component — Story 7.3 (Regenerate a quiz)', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockUseParams.mockReturnValue({ id: 'quiz-123' });

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
    });

    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token-123',
        },
      },
    });

    // Mock Supabase quiz fetch chain
    mockSingle.mockResolvedValue({ data: mockQuiz, error: null });
    mockOr.mockReturnValue({ single: mockSingle });
    mockEq.mockReturnValue({ or: mockOr });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert });
  });

  describe('AC-7.3.1: Regenerate sends POST /quiz/generate with original params AND Authorization header', () => {
    it('sends POST request to /quiz/generate with original quiz parameters', async () => {
      // Mock successful regenerate response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
        }),
      });

      // Mock insert for saving regenerated quiz
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'new-quiz-456' },
            error: null,
          }),
        }),
      });

      renderQuizStudy();

      // Wait for quiz to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Biology — Medium/i })).toBeInTheDocument();
      });

      // Click Regenerate button
      const regenerateButton = screen.getByRole('button', { name: /Regenerate/i });
      fireEvent.click(regenerateButton);

      // Assert fetch was called with correct parameters
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
      // Mock successful regenerate response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
        }),
      });

      // Mock insert for saving regenerated quiz
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'new-quiz-456' },
            error: null,
          }),
        }),
      });

      renderQuizStudy();

      // Wait for quiz to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Biology — Medium/i })).toBeInTheDocument();
      });

      // Click Regenerate button
      const regenerateButton = screen.getByRole('button', { name: /Regenerate/i });
      fireEvent.click(regenerateButton);

      // Assert Authorization header contains Bearer token
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-token-123',
            }),
          })
        );
      });
    });

    it('sends original quiz parameters in request body', async () => {
      // Mock successful regenerate response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
        }),
      });

      // Mock insert for saving regenerated quiz
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'new-quiz-456' },
            error: null,
          }),
        }),
      });

      renderQuizStudy();

      // Wait for quiz to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Biology — Medium/i })).toBeInTheDocument();
      });

      // Click Regenerate button
      const regenerateButton = screen.getByRole('button', { name: /Regenerate/i });
      fireEvent.click(regenerateButton);

      // Assert request body contains original parameters
      await waitFor(() => {
        const fetchCall = global.fetch.mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.topic).toBe('Biology');
        expect(requestBody.difficulty).toBe('Medium');
        expect(requestBody.num_questions).toBe(2); // Length of mockQuiz.questions
        expect(requestBody.file_id).toBe('file-456');
        expect(requestBody.outside_sources).toBe(true);
      });
    });
  });

  describe('AC-7.3.2: Regenerated quiz title has (v2) suffix', () => {
    it('saves regenerated quiz with (v2) suffix in title', async () => {
      // Mock successful regenerate response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
        }),
      });

      // Mock insert for saving regenerated quiz
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'new-quiz-456' },
            error: null,
          }),
        }),
      });

      renderQuizStudy();

      // Wait for quiz to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Biology — Medium/i })).toBeInTheDocument();
      });

      // Click Regenerate button
      const regenerateButton = screen.getByRole('button', { name: /Regenerate/i });
      fireEvent.click(regenerateButton);

      // Assert insert was called with (v2) suffix in title
      await waitFor(() => {
        expect(mockInsert).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Biology — Medium (v2)',
          })
        );
      });
    });
  });

  describe('AC-7.3.3: Page navigates to /quiz/:new_id after regenerate', () => {
    it('navigates to new quiz URL after successful regenerate', async () => {
      // Mock successful regenerate response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
        }),
      });

      // Mock insert for saving regenerated quiz
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'new-quiz-456' },
            error: null,
          }),
        }),
      });

      renderQuizStudy();

      // Wait for quiz to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Biology — Medium/i })).toBeInTheDocument();
      });

      // Click Regenerate button
      const regenerateButton = screen.getByRole('button', { name: /Regenerate/i });
      fireEvent.click(regenerateButton);

      // Assert navigate was called with new quiz ID
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/quiz/new-quiz-456');
      });
    });
  });
});
