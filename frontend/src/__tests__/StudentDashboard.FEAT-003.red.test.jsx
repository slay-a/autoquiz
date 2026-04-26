/**
 * FEAT-003 Student Dashboard — Red-phase tests
 *
 * Pins blocker B1: Dashboard.jsx must NOT query Supabase tables directly.
 * Per DESIGN.md §0 (Frontend): "Pages call the FastAPI backend directly
 * (fetch/axios) — not Supabase tables."
 * supabase.js is for auth operations only; table queries go through FastAPI.
 *
 * These tests will fail on the current implementation because Dashboard.jsx
 * calls supabase.from("saved_quizzes") and supabase.from("flashcard_sets")
 * directly (lines 57-58).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import StudentDashboard from '../pages/student/Dashboard';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Track all supabase.from() calls so we can assert none touch data tables
const supabaseFromCalls = [];
const mockGetSession = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
    from: (tableName) => {
      supabaseFromCalls.push(tableName);
      // Return a mock chain that won't crash
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => Promise.resolve({ data: [] }),
        execute: () => Promise.resolve({ data: [] }),
      };
      return chain;
    },
  },
}));

// Mock fetch — return empty but valid responses
global.fetch = vi.fn();

function renderDashboard() {
  return render(
    <BrowserRouter>
      <StudentDashboard />
    </BrowserRouter>
  );
}

describe('StudentDashboard - FEAT-003 B1: No direct Supabase table queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseFromCalls.length = 0;

    mockUseAuth.mockReturnValue({
      user: { id: 'student-123', email: 'student@example.com' },
      profile: { full_name: 'Jane Student', role: 'student' },
      loading: false,
    });

    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-jwt-token' } },
    });

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [],
      text: async () => '',
    });

    // Set up fetch to handle the three FastAPI calls:
    // 1. GET /classes/student/classes
    // 2. GET /classes/student/content
    // 3. GET /notes/my
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ quizzes: [], notes: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
  });

  it('B1: Dashboard must not call supabase.from("saved_quizzes") directly', async () => {
    renderDashboard();

    // Wait for data fetching to complete
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // DESIGN.md §0 (Frontend): "Pages call the FastAPI backend directly
    // (fetch/axios) — not Supabase tables."
    // supabase.from("saved_quizzes") is a direct table query — CRITICAL violation.
    expect(supabaseFromCalls).not.toContain('saved_quizzes'), (
      `Dashboard.jsx called supabase.from('saved_quizzes') directly. ` +
      `This is a CRITICAL layer violation per DESIGN.md §0. ` +
      `Student quizzes must be fetched via a FastAPI backend route, not the Supabase JS client.`
    );
  });

  it('B1: Dashboard must not call supabase.from("flashcard_sets") directly', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });

    expect(supabaseFromCalls).not.toContain('flashcard_sets'), (
      `Dashboard.jsx called supabase.from('flashcard_sets') directly. ` +
      `This is a CRITICAL layer violation per DESIGN.md §0. ` +
      `Flashcard sets must be fetched via a FastAPI backend route.`
    );
  });

  it('B1: Dashboard must use fetch() for all data operations (not supabase.from)', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // The only allowed supabase calls are auth operations (getSession)
    // No data table (saved_quizzes, flashcard_sets, class_members, etc.) should be queried
    const dataTableCalls = supabaseFromCalls.filter(
      (table) => !['auth'].includes(table)
    );

    expect(dataTableCalls).toHaveLength(0), (
      `Dashboard called supabase.from() on data tables: ${dataTableCalls.join(', ')}. ` +
      `Only auth operations are allowed via the Supabase JS client. ` +
      `All data fetches must go through the FastAPI backend (DESIGN.md §0, §8.5).`
    );
  });

  it('B1: Dashboard fetches my-quizzes via FastAPI backend route', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Verify that fetch() was called for data (not supabase.from)
    // The calls should include the backend endpoints
    const fetchCalls = global.fetch.mock.calls.map((c) => c[0]);

    // There should be a fetch call to a /my-quizzes or equivalent backend route
    const hasQuizzesBackendCall = fetchCalls.some(
      (url) => typeof url === 'string' && (
        url.includes('/quiz') ||
        url.includes('/saved_quizzes') ||
        url.includes('/my-quizzes') ||
        url.includes('/student/quizzes')
      )
    );

    expect(hasQuizzesBackendCall).toBe(true), (
      `Dashboard must fetch the student's own quizzes via the FastAPI backend, ` +
      `not via supabase.from('saved_quizzes'). ` +
      `Actual fetch calls: ${fetchCalls.join(', ')}`
    );
  });

  it('B1: Dashboard fetches flashcard sets via FastAPI backend route', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });

    const fetchCalls = global.fetch.mock.calls.map((c) => c[0]);

    const hasFlashcardsBackendCall = fetchCalls.some(
      (url) => typeof url === 'string' && (
        url.includes('/flashcard') ||
        url.includes('/student/flashcards')
      )
    );

    expect(hasFlashcardsBackendCall).toBe(true), (
      `Dashboard must fetch flashcard sets via the FastAPI backend, ` +
      `not via supabase.from('flashcard_sets'). ` +
      `Actual fetch calls: ${fetchCalls.join(', ')}`
    );
  });
});
