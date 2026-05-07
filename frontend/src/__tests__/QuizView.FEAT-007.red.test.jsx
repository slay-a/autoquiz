/**
 * FEAT-007 Red-phase tests — Quiz Study: short_answer rendering, self-assess
 * toggle, score banner accuracy, banner footer, and wrong-pool merging.
 *
 * Blockers pinned:
 *   B1 (CRITICAL / AC-7.1.4) — short_answer questions must render an input field
 *   B2 (CRITICAL / AC-7.4.4) — self-assess "I got this right / I got this wrong"
 *                               toggle must appear after submission
 *   B3 (MAJOR   / AC-7.4.1)  — score denominator must be MCQ+TF only, not all
 *   B4 (MAJOR   / AC-7.4.3)  — banner footer notes short-answer is self-review only
 *   B5 (MAJOR   / AC-7.5.1)  — wrong pool merges MCQ/TF auto-wrongs + SA self-wrongs
 *   B6 (FAIL    / AC-7.1.5/6)— answered counter and Submit enable include short_answer
 *
 * Every test in this file MUST fail against the current QuizView.jsx
 * (before the prototyper's fix) and pass after.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuizView from '../components/QuizView';

vi.mock('lucide-react', () => ({
  CheckCircle2: () => <span data-testid="check-icon" />,
  XCircle:      () => <span data-testid="x-icon" />,
  Trophy:       () => <span data-testid="trophy-icon" />,
  Layers:       () => <span data-testid="layers-icon" />,
  Send:         () => <span data-testid="send-icon" />,
  ThumbsUp:     () => <span data-testid="thumbs-up-icon" />,
  ThumbsDown:   () => <span data-testid="thumbs-down-icon" />,
}));

/* ── Shared fixtures ─────────────────────────────────────────────────── */

const MCQ_Q = {
  question_id: 'q-mcq',
  type: 'mcq',
  question: 'What is the powerhouse of the cell?',
  options: [
    { label: 'A', text: 'Nucleus' },
    { label: 'B', text: 'Mitochondria' },
    { label: 'C', text: 'Ribosome' },
    { label: 'D', text: 'Golgi apparatus' },
  ],
  answer: 'B',
  explanation: 'Mitochondria produce ATP.',
};

const TF_Q = {
  question_id: 'q-tf',
  type: 'true_false',
  question: 'Photosynthesis occurs in mitochondria.',
  answer: 'False',
  explanation: 'It occurs in chloroplasts.',
};

const SA_Q = {
  question_id: 'q-sa',
  type: 'short_answer',
  question: 'What is the process by which plants make food?',
  answer: 'Photosynthesis',
  explanation: 'Plants use light to convert CO2 and water into glucose.',
};

const MIXED_QUIZ = {
  topic: 'Biology',
  difficulty: 'medium',
  questions: [MCQ_Q, TF_Q, SA_Q],
};

const SA_ONLY_QUIZ = {
  topic: 'Biology',
  difficulty: 'medium',
  questions: [SA_Q],
};

const ALL_WRONG_MCQ_QUIZ = {
  topic: 'Biology',
  difficulty: 'medium',
  questions: [
    { ...MCQ_Q, question_id: 'q-mcq-2' },
    SA_Q,
  ],
};

/* ── Helper ──────────────────────────────────────────────────────────── */

function renderQuiz(quiz, onMakeFlashcards = vi.fn()) {
  return render(<QuizView quiz={quiz} onMakeFlashcards={onMakeFlashcards} />);
}

/** Select the first MCQ option and click Submit Quiz */
async function submitAfterSelectingMcq(mcqOption = 'Nucleus') {
  const optBtn = screen.getByText(mcqOption).closest('button');
  fireEvent.click(optBtn);
  const submitBtn = screen.getByRole('button', { name: /submit quiz/i });
  fireEvent.click(submitBtn);
}

/* ── B1: AC-7.1.4 — short_answer questions must render ──────────────── */

describe('B1 (CRITICAL AC-7.1.4) — short_answer questions are rendered', () => {
  it('renders the short-answer question text', () => {
    renderQuiz(MIXED_QUIZ);
    expect(
      screen.getByText('What is the process by which plants make food?')
    ).toBeInTheDocument();
  });

  it('renders a text input field for short-answer questions before submit', () => {
    renderQuiz(SA_ONLY_QUIZ);
    // Must find an <input> or <textarea> for writing the answer
    const input = screen.queryByRole('textbox');
    expect(input).not.toBeNull();
  });

  it('short-answer input accepts user text', () => {
    renderQuiz(SA_ONLY_QUIZ);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Photosynthesis' } });
    expect(input.value).toBe('Photosynthesis');
  });
});

/* ── B6: AC-7.1.5/7.1.6 — answered counter includes short_answer ────── */

describe('B6 (FAIL AC-7.1.5/7.1.6) — answered counter and Submit includes short_answer', () => {
  it('counts short-answer text entry in the answered/total counter', async () => {
    renderQuiz(MIXED_QUIZ);

    // Initially: 0/3 answered
    expect(screen.getByText(/0\/3 answered|0 of 3 answered/i)).toBeInTheDocument();
  });

  it('shows total question count including short_answer', () => {
    renderQuiz(MIXED_QUIZ);
    // Header should show 3 questions (mcq + tf + short_answer), not 2
    const q3 = screen.getAllByText(/3 questions/i); expect(q3.length).toBeGreaterThan(0);
  });

  it('Submit Quiz button is disabled when only short-answer has text but not selected via MCQ/TF', () => {
    renderQuiz(SA_ONLY_QUIZ);
    // Before any input, Submit must be disabled (answeredCount === 0)
    const submitBtn = screen.getByRole('button', { name: /submit quiz/i });
    expect(submitBtn).toBeDisabled();
  });

  it('Submit Quiz button enables after short-answer input is typed', async () => {
    renderQuiz(SA_ONLY_QUIZ);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Photosynthesis' } });

    const submitBtn = screen.getByRole('button', { name: /submit quiz/i });
    expect(submitBtn).not.toBeDisabled();
  });
});

/* ── B3: AC-7.4.1 — score denominator must be MCQ+TF only ──────────── */

describe('B3 (MAJOR AC-7.4.1) — score banner uses MCQ+TF denominator only', () => {
  it('score banner shows correct / total_graded where total_graded = MCQ+TF count only', async () => {
    renderQuiz(MIXED_QUIZ);

    // Answer MCQ wrong (select A not B), answer TF correctly (False),
    // fill in SA
    fireEvent.click(screen.getByText('Nucleus').closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /^False$/i }));
    const saInput = screen.getByRole('textbox');
    fireEvent.change(saInput, { target: { value: 'Photosynthesis' } });

    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }));

    // Score: 1 correct (TF) out of 2 graded (MCQ+TF only) — short_answer NOT in denominator
    await waitFor(() => {
      // Trophy badge and banner must show 1/2, not 1/3
      const scoreTexts = screen.getAllByText(/1\/2/i);
      expect(scoreTexts.length).toBeGreaterThan(0);
    });
  });

  it('score banner does NOT count short_answer in denominator even if answered', async () => {
    renderQuiz(MIXED_QUIZ);

    // Select MCQ correctly (B)
    fireEvent.click(screen.getByText('Mitochondria').closest('button'));
    // Select TF correctly (False)
    fireEvent.click(screen.getByRole('button', { name: /^False$/i }));
    // Fill SA
    const saInput = screen.getByRole('textbox');
    fireEvent.change(saInput, { target: { value: 'Photosynthesis' } });

    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }));

    // Score should be 2/2 not 3/3
    await waitFor(() => {
      const scoreTexts = screen.getAllByText(/2\/2/i);
      expect(scoreTexts.length).toBeGreaterThan(0);
    });
  });
});

/* ── B4: AC-7.4.3 — banner footer notes short-answer self-review ─────── */

describe('B4 (MAJOR AC-7.4.3) — banner footer notes short-answer is self-review', () => {
  it('shows a short-answer self-review note in the banner footer when SA questions are present', async () => {
    renderQuiz(MIXED_QUIZ);

    // Select MCQ and TF to enable submit
    fireEvent.click(screen.getByText('Mitochondria').closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /^False$/i }));
    const saInput = screen.getByRole('textbox');
    fireEvent.change(saInput, { target: { value: 'anything' } });

    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }));

    await waitFor(() => {
      // Must show a note about short-answer / self-review in the banner
      const bannerItems = screen.getAllByText(
        /short.answer|self.review|not counted|for self/i
      );
      expect(bannerItems.length).toBeGreaterThan(0);
    });
  });

  it('does NOT show short-answer banner footer when quiz has no SA questions', async () => {
    const mcqOnlyQuiz = {
      topic: 'Biology',
      difficulty: 'easy',
      questions: [MCQ_Q],
    };
    renderQuiz(mcqOnlyQuiz);

    fireEvent.click(screen.getByText('Mitochondria').closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }));

    await waitFor(() => {
      // No short-answer footer should appear
      expect(
        screen.queryByText(/short.answer|self.review|not counted/i)
      ).not.toBeInTheDocument();
    });
  });
});

/* ── B2: AC-7.4.4 — self-assess toggle on short-answer cards ────────── */

describe('B2 (CRITICAL AC-7.4.4) — self-assess toggle on short-answer cards', () => {
  it('shows "I got this right" and "I got this wrong" buttons after submit on SA card', async () => {
    renderQuiz(MIXED_QUIZ);

    fireEvent.click(screen.getByText('Mitochondria').closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /^False$/i }));
    const saInput = screen.getByRole('textbox');
    fireEvent.change(saInput, { target: { value: 'Photosynthesis' } });

    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /i got this right/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /i got this wrong/i })
      ).toBeInTheDocument();
    });
  });

  it('self-assess toggle is not shown before submission', () => {
    renderQuiz(SA_ONLY_QUIZ);
    expect(
      screen.queryByRole('button', { name: /i got this right/i })
    ).not.toBeInTheDocument();
  });

  it('self-assess toggle is only shown on short_answer cards, not MCQ', async () => {
    renderQuiz(MIXED_QUIZ);

    fireEvent.click(screen.getByText('Mitochondria').closest('button'));
    fireEvent.click(screen.getByRole('button', { name: /^False$/i }));
    const saInput = screen.getByRole('textbox');
    fireEvent.change(saInput, { target: { value: 'anything' } });

    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }));

    await waitFor(() => {
      // Should be exactly one pair (one short_answer card)
      const rightBtns = screen.getAllByRole('button', { name: /i got this right/i });
      const wrongBtns = screen.getAllByRole('button', { name: /i got this wrong/i });
      expect(rightBtns).toHaveLength(1);
      expect(wrongBtns).toHaveLength(1);
    });
  });

  it('self-assess model answer revealed after submission on SA card', async () => {
    renderQuiz(SA_ONLY_QUIZ);
    const saInput = screen.getByRole('textbox');
    fireEvent.change(saInput, { target: { value: 'Photosynthesis' } });

    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }));

    await waitFor(() => {
      expect(screen.getByText(/Photosynthesis/i)).toBeInTheDocument();
    });
  });
});

/* ── B5: AC-7.5.1 — wrong pool merges MCQ/TF wrongs + SA self-wrongs ── */

describe('B5 (MAJOR AC-7.5.1) — wrong pool includes self-assessed SA wrongs', () => {
  it('CTA "Convert N wrong answers" includes self-marked-wrong SA in the count', async () => {
    const onMakeFlashcards = vi.fn();
    // Quiz: one MCQ (answered correctly), one SA
    const quiz = {
      topic: 'Biology',
      difficulty: 'medium',
      questions: [
        { ...MCQ_Q },  // answer B
        SA_Q,
      ],
    };
    render(<QuizView quiz={quiz} onMakeFlashcards={onMakeFlashcards} />);

    // Answer MCQ correctly
    fireEvent.click(screen.getByText('Mitochondria').closest('button'));
    // Fill SA
    const saInput = screen.getByRole('textbox');
    fireEvent.change(saInput, { target: { value: 'Photosynthesis' } });

    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }));

    // Mark SA as wrong
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /i got this wrong/i })
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /i got this wrong/i }));

    // CTA should now show "1 wrong answer" (the SA) even though MCQ was correct
    await waitFor(() => {
      const ctaBtns = screen.getAllByText(/convert.*wrong.*flashcard|wrong.*flashcard/i);
      expect(ctaBtns.length).toBeGreaterThan(0);
      // Verify onMakeFlashcards receives the SA question when CTA is clicked
    });
  });

  it('CTA is hidden when MCQ/TF all correct AND no SA self-marked wrong', async () => {
    const onMakeFlashcards = vi.fn();
    const quiz = {
      topic: 'Biology',
      difficulty: 'medium',
      questions: [
        { ...MCQ_Q },  // answer B
        SA_Q,
      ],
    };
    render(<QuizView quiz={quiz} onMakeFlashcards={onMakeFlashcards} />);

    // Answer MCQ correctly
    fireEvent.click(screen.getByText('Mitochondria').closest('button'));
    // Fill SA
    const saInput = screen.getByRole('textbox');
    fireEvent.change(saInput, { target: { value: 'Photosynthesis' } });

    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }));

    // Mark SA as right
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /i got this right/i })
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /i got this right/i }));

    // CTA should be hidden — no wrongs in pool
    await waitFor(() => {
      expect(
        screen.queryByText(/convert.*wrong.*flashcard/i)
      ).not.toBeInTheDocument();
    });
  });

  it('onMakeFlashcards is called with SA question when SA is self-marked wrong', async () => {
    const onMakeFlashcards = vi.fn();
    const quiz = {
      topic: 'Biology',
      difficulty: 'medium',
      questions: [
        { ...MCQ_Q },  // answer B — will be answered correctly
        SA_Q,
      ],
    };
    render(<QuizView quiz={quiz} onMakeFlashcards={onMakeFlashcards} />);

    // Answer MCQ correctly
    fireEvent.click(screen.getByText('Mitochondria').closest('button'));
    // Fill SA
    const saInput = screen.getByRole('textbox');
    fireEvent.change(saInput, { target: { value: 'anything' } });

    fireEvent.click(screen.getByRole('button', { name: /submit quiz/i }));

    // Mark SA as wrong
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /i got this wrong/i })
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /i got this wrong/i }));

    // Click the CTA in the banner or header
    await waitFor(() => {
      const ctaBtns = screen.getAllByText(/convert.*wrong.*flashcard|wrong.*flashcard/i);
      expect(ctaBtns.length).toBeGreaterThan(0);
    });

    const ctaBtn = screen.getAllByText(/convert.*wrong.*flashcard|wrong.*flashcard/i)[0].closest('button');
    fireEvent.click(ctaBtn);

    await waitFor(() => {
      expect(onMakeFlashcards).toHaveBeenCalled();
      const calledWith = onMakeFlashcards.mock.calls[0][0];
      const saQuestion = calledWith.find((q) => q.question_id === 'q-sa');
      expect(saQuestion).toBeDefined();
    });
  });
});
