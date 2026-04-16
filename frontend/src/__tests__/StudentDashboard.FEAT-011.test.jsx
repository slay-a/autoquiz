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
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}));

import { supabase } from '../lib/supabase';

// Mock fetch
global.fetch = vi.fn();

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

    // Setup chainable supabase query mocks
    supabase.from.mockImplementation((table) => {
      if (table === 'flashcard_sets') {
        return {
          select: mockSelect,
        };
      }
      if (table === 'saved_quizzes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
      };
    });

    mockSelect.mockReturnValue({
      eq: mockEq,
    });

    mockEq.mockReturnValue({
      order: mockOrder,
    });

    mockOrder.mockResolvedValue({
      data: mockFlashcardSets,
    });

    // Mock fetch for classes and content
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ quizzes: [], notes: [] }),
    });
  });

  it('Flashcards tab fetches sets using .eq("created_by", user.id)', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('flashcard_sets');
    });

    // Verify the query chain
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('created_by', 'student-123');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('Flashcards tab displays sets owned by the current user', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Click the Flashcards tab
    const flashcardsTab = screen.getByRole('button', { name: /flashcards/i });
    await user.click(flashcardsTab);

    // Verify both flashcard sets are displayed
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

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
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

    // Mock empty flashcard sets
    mockOrder.mockResolvedValue({
      data: [],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Switch to Flashcards tab
    const flashcardsTab = screen.getByRole('button', { name: /flashcards/i });
    await user.click(flashcardsTab);

    // Verify empty state message
    await waitFor(() => {
      expect(screen.getByText(/no flashcard sets yet/i)).toBeInTheDocument();
    });
  });

  it('Flashcards tab does NOT fetch sets created by other users', async () => {
    // Add a set created by a different user to the mock data
    const mixedSets = [
      ...mockFlashcardSets,
      {
        id: 'set-other',
        title: 'Other User Set',
        created_by: 'other-user-456',
        cards: [{ front: 'Q', back: 'A' }],
        created_at: '2026-04-13T10:00:00Z',
      },
    ];

    // Mock should only return sets for current user (Supabase filtering)
    mockOrder.mockResolvedValue({
      data: mockFlashcardSets, // Only the user's sets
    });

    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Switch to Flashcards tab
    const flashcardsTab = screen.getByRole('button', { name: /flashcards/i });
    await user.click(flashcardsTab);

    await waitFor(() => {
      expect(screen.getByText('Biology Flashcards')).toBeInTheDocument();
    });

    // Verify the other user's set is NOT displayed
    expect(screen.queryByText('Other User Set')).not.toBeInTheDocument();

    // Verify the query was scoped to current user
    expect(mockEq).toHaveBeenCalledWith('created_by', 'student-123');
  });
});
