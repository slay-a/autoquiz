/**
 * Tests for QuizView.jsx — FEAT-007 Story 7.1 (Study a quiz).
 *
 * Tests cover:
 * - AC-7.1.2: MCQ question renders A, B, C, D options
 * - AC-7.1.3: Answer locks after submit — input disabled after selection
 * - AC-7.1.4: True/false presents exactly two options
 * - AC-7.1.5: Short answer reveals model answer on submission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuizView from '../components/QuizView';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  CheckCircle2: () => <div data-testid="check-icon" />,
  XCircle: () => <div data-testid="x-icon" />,
  BookOpen: () => <div data-testid="book-icon" />,
  Trophy: () => <div data-testid="trophy-icon" />,
  Layers: () => <div data-testid="layers-icon" />,
}));

const renderQuizView = (quiz, onMakeFlashcards = vi.fn()) => {
  return render(<QuizView quiz={quiz} onMakeFlashcards={onMakeFlashcards} />);
};

describe('QuizView Component — Story 7.1 (Study a Quiz)', () => {
  describe('AC-7.1.2: MCQ renders A, B, C, D options', () => {
    it('renders all 4 MCQ options with correct labels', () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'What is the powerhouse of the cell?',
            type: 'mcq',
            options: [
              { label: 'A', text: 'Nucleus' },
              { label: 'B', text: 'Mitochondria' },
              { label: 'C', text: 'Ribosome' },
              { label: 'D', text: 'Golgi apparatus' },
            ],
            answer: 'B',
            explanation: 'Mitochondria produce ATP.',
          },
        ],
      };

      renderQuizView(quiz);

      // Assert all 4 option labels are rendered
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
      expect(screen.getByText('C')).toBeInTheDocument();
      expect(screen.getByText('D')).toBeInTheDocument();

      // Assert option text is rendered
      expect(screen.getByText('Nucleus')).toBeInTheDocument();
      expect(screen.getByText('Mitochondria')).toBeInTheDocument();
      expect(screen.getByText('Ribosome')).toBeInTheDocument();
      expect(screen.getByText('Golgi apparatus')).toBeInTheDocument();
    });

    it('renders question text', () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'What is the powerhouse of the cell?',
            type: 'mcq',
            options: [
              { label: 'A', text: 'Nucleus' },
              { label: 'B', text: 'Mitochondria' },
              { label: 'C', text: 'Ribosome' },
              { label: 'D', text: 'Golgi apparatus' },
            ],
            answer: 'B',
            explanation: 'Mitochondria produce ATP.',
          },
        ],
      };

      renderQuizView(quiz);
      expect(screen.getByText('What is the powerhouse of the cell?')).toBeInTheDocument();
    });
  });

  describe('AC-7.1.3: Answer locks after submit', () => {
    it('disables MCQ options after revealing answer', async () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'What is the powerhouse of the cell?',
            type: 'mcq',
            options: [
              { label: 'A', text: 'Nucleus' },
              { label: 'B', text: 'Mitochondria' },
              { label: 'C', text: 'Ribosome' },
              { label: 'D', text: 'Golgi apparatus' },
            ],
            answer: 'B',
            explanation: 'Mitochondria produce ATP.',
          },
        ],
      };

      renderQuizView(quiz);

      // Select an option
      const optionB = screen.getByText('Mitochondria').closest('button');
      fireEvent.click(optionB);

      // Reveal the answer
      const revealButton = screen.getByText('Reveal Answer');
      fireEvent.click(revealButton);

      // Assert all option buttons are disabled
      await waitFor(() => {
        const optionA = screen.getByText('Nucleus').closest('button');
        const optionB = screen.getByText('Mitochondria').closest('button');
        const optionC = screen.getByText('Ribosome').closest('button');
        const optionD = screen.getByText('Golgi apparatus').closest('button');

        expect(optionA).toBeDisabled();
        expect(optionB).toBeDisabled();
        expect(optionC).toBeDisabled();
        expect(optionD).toBeDisabled();
      });
    });

    it('reveals correct answer text after submission', async () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'What is the powerhouse of the cell?',
            type: 'mcq',
            options: [
              { label: 'A', text: 'Nucleus' },
              { label: 'B', text: 'Mitochondria' },
              { label: 'C', text: 'Ribosome' },
              { label: 'D', text: 'Golgi apparatus' },
            ],
            answer: 'B',
            explanation: 'Mitochondria produce ATP.',
          },
        ],
      };

      renderQuizView(quiz);

      // Select an option
      const optionB = screen.getByText('Mitochondria').closest('button');
      fireEvent.click(optionB);

      // Reveal the answer
      const revealButton = screen.getByText('Reveal Answer');
      fireEvent.click(revealButton);

      // Assert correct answer is shown
      await waitFor(() => {
        expect(screen.getByText(/Answer: B/i)).toBeInTheDocument();
      });
    });

    it('reveals explanation text after submission', async () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'What is the powerhouse of the cell?',
            type: 'mcq',
            options: [
              { label: 'A', text: 'Nucleus' },
              { label: 'B', text: 'Mitochondria' },
              { label: 'C', text: 'Ribosome' },
              { label: 'D', text: 'Golgi apparatus' },
            ],
            answer: 'B',
            explanation: 'Mitochondria produce ATP.',
          },
        ],
      };

      renderQuizView(quiz);

      // Select an option
      const optionB = screen.getByText('Mitochondria').closest('button');
      fireEvent.click(optionB);

      // Reveal the answer
      const revealButton = screen.getByText('Reveal Answer');
      fireEvent.click(revealButton);

      // Assert explanation is shown
      await waitFor(() => {
        expect(screen.getByText('Mitochondria produce ATP.')).toBeInTheDocument();
      });
    });
  });

  describe('AC-7.1.4: True/false presents exactly two options', () => {
    it('renders exactly 2 options for true/false questions', () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'Photosynthesis occurs in mitochondria.',
            type: 'true_false',
            answer: 'False',
            explanation: 'Photosynthesis occurs in chloroplasts, not mitochondria.',
          },
        ],
      };

      renderQuizView(quiz);

      // Assert exactly 2 buttons are rendered (True and False)
      const trueButton = screen.getByRole('button', { name: /^True$/i });
      const falseButton = screen.getByRole('button', { name: /^False$/i });

      expect(trueButton).toBeInTheDocument();
      expect(falseButton).toBeInTheDocument();

      // Assert no other options are rendered (query all buttons in the question card)
      const allButtons = screen.getAllByRole('button');
      // Filter to only option buttons (exclude Reveal Answer button)
      const optionButtons = allButtons.filter(btn =>
        btn.textContent === 'True' || btn.textContent === 'False'
      );
      expect(optionButtons).toHaveLength(2);
    });

    it('renders True and False labels correctly', () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'Photosynthesis occurs in mitochondria.',
            type: 'true_false',
            answer: 'False',
            explanation: 'Photosynthesis occurs in chloroplasts, not mitochondria.',
          },
        ],
      };

      renderQuizView(quiz);

      expect(screen.getByRole('button', { name: /^True$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^False$/i })).toBeInTheDocument();
    });
  });

  describe('AC-7.1.5: Short answer reveals model answer on submission', () => {
    it('displays input field for short answer question', () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'What is the process by which plants make food?',
            type: 'short_answer',
            answer: 'Photosynthesis',
            explanation: 'Photosynthesis uses light energy to convert CO2 and water into glucose.',
          },
        ],
      };

      renderQuizView(quiz);

      // Assert input field is rendered
      const input = screen.getByPlaceholderText(/Type your answer/i);
      expect(input).toBeInTheDocument();
    });

    it('reveals model answer after submission', async () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'What is the process by which plants make food?',
            type: 'short_answer',
            answer: 'Photosynthesis',
            explanation: 'Photosynthesis uses light energy to convert CO2 and water into glucose.',
          },
        ],
      };

      renderQuizView(quiz);

      // Type an answer
      const input = screen.getByPlaceholderText(/Type your answer/i);
      fireEvent.change(input, { target: { value: 'Photosynthesis' } });

      // Reveal the answer
      const revealButton = screen.getByText('Reveal Answer');
      fireEvent.click(revealButton);

      // Assert model answer is shown
      await waitFor(() => {
        expect(screen.getByText(/Answer: Photosynthesis/i)).toBeInTheDocument();
      });
    });

    it('reveals explanation after submission', async () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'What is the process by which plants make food?',
            type: 'short_answer',
            answer: 'Photosynthesis',
            explanation: 'Photosynthesis uses light energy to convert CO2 and water into glucose.',
          },
        ],
      };

      renderQuizView(quiz);

      // Type an answer
      const input = screen.getByPlaceholderText(/Type your answer/i);
      fireEvent.change(input, { target: { value: 'Photosynthesis' } });

      // Reveal the answer
      const revealButton = screen.getByText('Reveal Answer');
      fireEvent.click(revealButton);

      // Assert explanation is shown
      await waitFor(() => {
        expect(screen.getByText(/Photosynthesis uses light energy to convert CO2 and water into glucose/i)).toBeInTheDocument();
      });
    });

    it('hides input field after revealing answer', async () => {
      const quiz = {
        topic: 'Biology',
        difficulty: 'medium',
        questions: [
          {
            question_id: 'q1',
            question: 'What is the process by which plants make food?',
            type: 'short_answer',
            answer: 'Photosynthesis',
            explanation: 'Photosynthesis uses light energy to convert CO2 and water into glucose.',
          },
        ],
      };

      renderQuizView(quiz);

      // Type an answer
      const input = screen.getByPlaceholderText(/Type your answer/i);
      fireEvent.change(input, { target: { value: 'My answer' } });

      // Reveal the answer
      const revealButton = screen.getByText('Reveal Answer');
      fireEvent.click(revealButton);

      // Assert input field is no longer rendered
      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/Type your answer/i)).not.toBeInTheDocument();
      });
    });
  });
});
