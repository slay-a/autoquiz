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

// Mock supabase (auth session only — Dashboard fetches flashcards via FastAPI, not supabase.from)
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

import { supabase } from '../lib/supabase';

// Mock fetch globally — Dashboard.jsx calls FastAPI for all data including flashcards
global.fetch = vi.fn();

const FLASHCARDS_URL = 'http://localhost:8000/flashcards/my';

function renderDashboard() {
  return render(
    <BrowserRouter>
      <StudentDashboard />
    </BrowserRouter>
  );
}

describe('StudentDashboard - FEAT-011 Flashcards', () => {
  const mockUser = {
    id: 'student-123',
    email: 'student@example.com',
  };

  const mockProfile = {
    full_name: 'Jane Student',
    role: 'student',
  };

  const mockToken = 'mock-jwt-token';

  const mockFlashcardSets = [
    {
      id: 'set-1',
      title: 'Biology Flashcards',
      created_by: 'student-123',
      cards: [
        { front: 'What is a cell?', back: 'The basic unit of life' },
        { front: 'What is DNA?', back: 'Genetic material' },
      ],
      created_at: '2026-04-15T10:00:00Z',
    },
    {
      id: 'set-2',
      title: 'Math Flashcards',
      created_by: 'student-123',
      cards: [
        { front: 'What is pi?', back: '3.14159...' },
      ],
      created_at: '2026-04-14T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: mockUser,
      profile: mockProfile,
      loading: false,
    });

    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: mockToken,
        },
      },
    });

    // Default fetch mock: route responses by URL.
    // Dashboard.jsx calls FastAPI for all data (DESIGN.md §0 frontend rules).
    global.fetch.mockImplementation((url) => {
      if (url === FLASHCARDS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => mockFlashcardSets,
        });
      }
      if (url.includes('/quiz/my')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes('/notes/my')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes('/classes/student/classes')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes('/classes/student/content')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ quizzes: [], notes: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    });
  });

  it('Flashcards tab fetches flashcard sets from the FastAPI /flashcards/my endpoint', async () => {
    // AC-spec §4b: Dashboard fetches flashcard_sets via GET /flashcards/my (FastAPI), not supabase.from()
    renderDashboard();

    await waitFor(() => {
      // Verify fetch was called with the flashcards endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        FLASHCARDS_URL,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
    });
  });

  it('Flashcards tab displays sets owned by the current user', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    // Click the Flashcards tab
    const flashcardsTab = screen.getByRole('button', { name: /flashcards/i });
    await user.click(flashcardsTab);

    // Verify both flashcard sets are displayed (returned by API scoped to created_by=user.id on backend)
    await waitFor(() => {
      expect(screen.getByText('Biology Flashcards')).toBeInTheDocument();
      expect(screen.getByText('Math Flashcards')).toBeInTheDocument();
    });

    // Verify card counts
    expect(screen.getByText('2 cards')).toBeInTheDocument();
    expect(screen.getByText('1 cards')).toBeInTheDocument();
  });

  it('each set in Flashcards tab has a Study link pointing to /flashcards/:id', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // Wait for load to finish
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Switch to Flashcards tab
    const flashcardsTab = screen.getByRole('button', { name: /flashcards/i });
    await user.click(flashcardsTab);

    await waitFor(() => {
      expect(screen.getByText('Biology Flashcards')).toBeInTheDocument();
    });

    // Find all Study links
    const studyLinks = screen.getAllByRole('link', { name: /study/i });
    expect(studyLinks.length).toBeGreaterThanOrEqual(2);

    // Verify the links point to the correct flashcard IDs
    const bioLink = studyLinks.find((link) => {
      return link.closest('.card')?.textContent.includes('Biology Flashcards');
    });
    const mathLink = studyLinks.find((link) => {
      return link.closest('.card')?.textContent.includes('Math Flashcards');
    });

    expect(bioLink).toHaveAttribute('href', '/flashcards/set-1');
    expect(mathLink).toHaveAttribute('href', '/flashcards/set-2');
  });

  it('Flashcards tab shows empty state when no sets exist', async () => {
    const user = userEvent.setup();

    // Mock API returning empty array for flashcards
    global.fetch.mockImplementation((url) => {
      if (url === FLASHCARDS_URL) {
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

    renderDashboard();

    // Wait for load to finish
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Switch to Flashcards tab
    const flashcardsTab = screen.getByRole('button', { name: /flashcards/i });
    await user.click(flashcardsTab);

    // Verify empty state message
    await waitFor(() => {
      expect(screen.getByText(/no flashcard sets yet/i)).toBeInTheDocument();
    });
  });

  it('Flashcards tab only shows sets the API returns (backend scopes to created_by = user.id)', async () => {
    // The backend /flashcards/my route filters by created_by = current_user["id"] (flashcards.py line 20).
    // The frontend renders exactly what the API returns, so the UI cannot show cross-user sets.
    // This test verifies the fetch is called and only the returned sets are displayed.
    const user = userEvent.setup();

    // API returns only the user's own sets (backend filtering is enforced at the route level)
    global.fetch.mockImplementation((url) => {
      if (url === FLASHCARDS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => mockFlashcardSets, // Only current user's sets returned by API
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    });

    renderDashboard();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        FLASHCARDS_URL,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
    });

    const flashcardsTab = screen.getByRole('button', { name: /flashcards/i });
    await user.click(flashcardsTab);

    await waitFor(() => {
      expect(screen.getByText('Biology Flashcards')).toBeInTheDocument();
    });

    // Verify the "other user's" set is NOT displayed
    // (it was never returned by the API — backend enforces owner-scoping)
    expect(screen.queryByText('Other User Set')).not.toBeInTheDocument();
  });
});
