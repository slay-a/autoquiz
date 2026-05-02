import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import FlashcardStudy from '../pages/FlashcardStudy';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock react-router-dom
const mockUseParams = vi.fn();
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockUseParams(),
    useNavigate: () => mockNavigate(),
  };
});

// Mock supabase — auth only (getSession for token retrieval)
const mockGetSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: 'test-token' } },
});
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    // supabase.from must NOT be called for flashcard_sets (DESIGN.md §0)
    from: vi.fn((table) => { throw new Error(`LAYER VIOLATION: supabase.from("${table}") from FlashcardStudy`); }),
  },
}));

// Mock global fetch
global.fetch = vi.fn();

function renderFlashcardStudy() {
  return render(
    <BrowserRouter>
      <FlashcardStudy />
    </BrowserRouter>
  );
}

describe('FlashcardStudy - FEAT-011', () => {
  const mockUser = {
    id: 'user-1',
    email: 'student@test.com',
  };

  const mockFlashcardSet = {
    id: 'set-1',
    title: 'Biology 101 - Cell Structure',
    created_by: 'user-1',
    cards: [
      { front: 'What is a cell?', back: 'The basic unit of life', explanation: 'All living things are made of cells' },
      { front: 'What is DNA?', back: 'Genetic material', explanation: 'Deoxyribonucleic acid' },
      { front: 'What is mitosis?', back: 'Cell division', explanation: 'Process of cell replication' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
    });

    mockUseParams.mockReturnValue({ id: 'set-1' });

    // Default successful fetch response
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockFlashcardSet,
    });
  });

  // ── Story 11.1: Study a flashcard set ───────────────────────────

  it('AC-11.1.1: renders "not found" message when set does not exist', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText(/flashcard set not found or empty/i)).toBeInTheDocument();
    });
  });

  it('AC-11.1.1: renders "empty" message when cards array is empty', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...mockFlashcardSet, cards: [] }),
    });

    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText(/flashcard set not found or empty/i)).toBeInTheDocument();
    });
  });

  it('AC-11.1.2: shows card front by default', async () => {
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Front label should be visible
    expect(screen.getByText('Question')).toBeInTheDocument();
    expect(screen.getByText('What is a cell?')).toBeVisible();
  });

  it('AC-11.1.2: clicking card reveals back face', async () => {
    const user = userEvent.setup();
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Click the card to flip
    const card = screen.getByText('What is a cell?').closest('div');
    await user.click(card);

    // Wait for flip animation
    await waitFor(() => {
      expect(screen.getByText('The basic unit of life')).toBeInTheDocument();
    });

    // Answer label should be visible
    expect(screen.getByText('Answer')).toBeInTheDocument();

    // Explanation should also be visible
    expect(screen.getByText('All living things are made of cells')).toBeInTheDocument();
  });

  it('AC-11.1.3: rating buttons absent before flip', async () => {
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Rating buttons should not be present
    expect(screen.queryByRole('button', { name: /missed/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /almost/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /got it/i })).not.toBeInTheDocument();
  });

  it('AC-11.1.3: rating buttons present after flip', async () => {
    const user = userEvent.setup();
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Click to flip
    const card = screen.getByText('What is a cell?').closest('div');
    await user.click(card);

    await waitFor(() => {
      expect(screen.getByText('The basic unit of life')).toBeInTheDocument();
    });

    // Rating buttons should now be present
    expect(screen.getByRole('button', { name: /missed/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /almost/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument();
  });

  it('AC-11.1.4: after rating all cards, results summary shows correct counts', async () => {
    const user = userEvent.setup();
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Card 1: Rate as "Know"
    let card = screen.getByText('What is a cell?').closest('div');
    await user.click(card);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /got it/i }));

    // Card 2: Rate as "Almost"
    await waitFor(() => {
      expect(screen.getByText('What is DNA?')).toBeInTheDocument();
    });
    card = screen.getByText('What is DNA?').closest('div');
    await user.click(card);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /almost/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /almost/i }));

    // Card 3: Rate as "Nope"
    await waitFor(() => {
      expect(screen.getByText('What is mitosis?')).toBeInTheDocument();
    });
    card = screen.getByText('What is mitosis?').closest('div');
    await user.click(card);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /missed/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /missed/i }));

    // Results summary should appear
    await waitFor(() => {
      expect(screen.getByText('Round complete!')).toBeInTheDocument();
    });

    // Verify counts: 1 know, 1 almost, 1 nope
    const knowCount = screen.getByText('Got it').closest('div').querySelector('p.text-2xl');
    const almostCount = screen.getByText('Almost').closest('div').querySelector('p.text-2xl');
    const nopeCount = screen.getByText('Missed').closest('div').querySelector('p.text-2xl');

    expect(knowCount).toHaveTextContent('1');
    expect(almostCount).toHaveTextContent('1');
    expect(nopeCount).toHaveTextContent('1');
  });

  // ── Story 11.2: Restart a flashcard session ──────────────────────

  it('AC-11.2.1: results summary has both Restart All and Retry Missed buttons', async () => {
    const user = userEvent.setup();
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Quickly rate all cards to reach results
    for (let i = 0; i < 3; i++) {
      const cardText = mockFlashcardSet.cards[i].front;
      await waitFor(() => {
        expect(screen.getByText(cardText)).toBeInTheDocument();
      });
      const card = screen.getByText(cardText).closest('div');
      await user.click(card);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /got it/i }));
    }

    // Results screen should appear
    await waitFor(() => {
      expect(screen.getByText('Round complete!')).toBeInTheDocument();
    });

    // Both buttons should be present
    expect(screen.getByRole('button', { name: /restart all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry missed/i })).toBeInTheDocument();
  });

  it('AC-11.2.2: Retry Missed button is present even when nope count is 0', async () => {
    const user = userEvent.setup();
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Rate all cards as "Know"
    for (let i = 0; i < 3; i++) {
      const cardText = mockFlashcardSet.cards[i].front;
      await waitFor(() => {
        expect(screen.getByText(cardText)).toBeInTheDocument();
      });
      const card = screen.getByText(cardText).closest('div');
      await user.click(card);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /got it/i }));
    }

    await waitFor(() => {
      expect(screen.getByText('Round complete!')).toBeInTheDocument();
    });

    // Retry Missed should still be present
    const retryButton = screen.getByRole('button', { name: /retry missed/i });
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).toHaveTextContent('Retry Missed');
  });

  it('AC-11.2.2: when nope=0, clicking Retry Missed restarts with the full set', async () => {
    const user = userEvent.setup();
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Rate all cards as "Know"
    for (let i = 0; i < 3; i++) {
      const cardText = mockFlashcardSet.cards[i].front;
      await waitFor(() => {
        expect(screen.getByText(cardText)).toBeInTheDocument();
      });
      const card = screen.getByText(cardText).closest('div');
      await user.click(card);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /got it/i }));
    }

    await waitFor(() => {
      expect(screen.getByText('Round complete!')).toBeInTheDocument();
    });

    // Click Retry Missed
    const retryButton = screen.getByRole('button', { name: /retry missed/i });
    await user.click(retryButton);

    // Should restart with the first card
    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Progress indicator should show we're at card 1 of 3 (full set, not empty)
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('AC-11.2.3: after restart, index resets to 0, results are cleared, summary is hidden, front face is shown', async () => {
    const user = userEvent.setup();
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Rate first two cards, leave last unrated
    const cardText1 = mockFlashcardSet.cards[0].front;
    await waitFor(() => {
      expect(screen.getByText(cardText1)).toBeInTheDocument();
    });
    let card = screen.getByText(cardText1).closest('div');
    await user.click(card);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /missed/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /missed/i }));

    const cardText2 = mockFlashcardSet.cards[1].front;
    await waitFor(() => {
      expect(screen.getByText(cardText2)).toBeInTheDocument();
    });
    card = screen.getByText(cardText2).closest('div');
    await user.click(card);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /almost/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /almost/i }));

    const cardText3 = mockFlashcardSet.cards[2].front;
    await waitFor(() => {
      expect(screen.getByText(cardText3)).toBeInTheDocument();
    });
    card = screen.getByText(cardText3).closest('div');
    await user.click(card);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /got it/i }));

    // Results summary should appear
    await waitFor(() => {
      expect(screen.getByText('Round complete!')).toBeInTheDocument();
    });

    // Click Restart All
    const restartButton = screen.getByRole('button', { name: /restart all/i });
    await user.click(restartButton);

    // Should return to first card
    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Results summary should be hidden
    expect(screen.queryByText('Round complete!')).not.toBeInTheDocument();

    // Should be on front face (Question label visible)
    expect(screen.getByText('Question')).toBeInTheDocument();

    // Rating buttons should not be visible (card not flipped)
    expect(screen.queryByRole('button', { name: /missed/i })).not.toBeInTheDocument();

    // Progress should be reset
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  // ── Story 11.3: Edit a flashcard set ──────────────────────────────

  it('AC-11.3.1: Edit set link is rendered during the study session', async () => {
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Edit link should be visible
    const editLink = screen.getByRole('link', { name: /edit set/i });
    expect(editLink).toBeInTheDocument();
    expect(editLink).toHaveAttribute('href', '/flashcards/set-1/edit');
  });

  // ── Layer boundary test (DESIGN.md §0) ───────────────────────────

  it('DESIGN.md §0: fetches flashcard set via FastAPI (GET /flashcards/:id), not supabase.from', async () => {
    renderFlashcardStudy();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Verify fetch was called with the FastAPI endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/flashcards\/set-1/),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
        }),
      })
    );
  });
});
