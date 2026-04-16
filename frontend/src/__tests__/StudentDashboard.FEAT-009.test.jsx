/**
 * Tests for Student Dashboard.jsx — FEAT-009 Story 9.2.4.
 *
 * Tests cover:
 * - AC-9.2.4: Dashboard "My Notes" tab renders notes from student_notes endpoint
 * - AC-9.2.4: Each entry links to /notes/:id
 * - AC-9.2.4: Class Notes tab is unaffected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from '../pages/student/Dashboard';

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
    from: (...args) => mockFrom(...args),
  },
}));

// Mock fetch globally
global.fetch = vi.fn();

const mockUser = {
  id: 'student-456',
  email: 'student@example.com',
  role: 'student',
};

const mockMyNotes = [
  {
    id: 'note-123',
    title: 'Python Exceptions',
    topic: 'Python Exceptions',
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'note-456',
    title: 'Data Structures',
    topic: 'Data Structures',
    created_at: '2024-01-14T09:00:00Z',
  },
];

const mockClassNotes = [
  {
    id: 'class-note-789',
    title: 'Lecture 1: Introduction',
    className: 'CS101',
    created_at: '2024-01-13T08:00:00Z',
  },
];

const renderDashboard = () => {
  return render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );
};

describe('Student Dashboard — Story 9.2.4 (My Notes Tab)', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
    });

    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
        },
      },
    });

    // Mock fetch for /notes/my and other endpoints
    global.fetch.mockImplementation((url) => {
      if (url.includes('/notes/my')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockMyNotes,
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
          json: async () => ({
            quizzes: [],
            notes: mockClassNotes,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [],
      });
    });

    // Mock Supabase from() calls for saved_quizzes and flashcard_sets
    mockFrom.mockImplementation((tableName) => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      };

      if (tableName === 'saved_quizzes' || tableName === 'flashcard_sets') {
        mockChain.order.mockResolvedValue({ data: [] });
      }

      return mockChain;
    });
  });

  it('AC-9.2.4: "My Notes" tab exists in dashboard', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/My Notes/i)).toBeInTheDocument();
    });
  });

  it('AC-9.2.4: My Notes tab displays saved notes from /notes/my endpoint', async () => {
    renderDashboard();

    // Wait for dashboard to load
    await waitFor(() => {
      expect(screen.getByText(/My Notes/i)).toBeInTheDocument();
    });

    // Click on "My Notes" tab
    const myNotesTab = screen.getByRole('button', { name: /My Notes/i });
    fireEvent.click(myNotesTab);

    // Wait for notes to appear
    await waitFor(() => {
      expect(screen.getByText(/Python Exceptions/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Data Structures/i)).toBeInTheDocument();

    // Verify fetch was called with correct endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/notes/my'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('AC-9.2.4: Each note entry links to /notes/:id', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/My Notes/i)).toBeInTheDocument();
    });

    // Click on "My Notes" tab
    const myNotesTab = screen.getByRole('button', { name: /My Notes/i });
    fireEvent.click(myNotesTab);

    // Wait for notes to appear
    await waitFor(() => {
      expect(screen.getByText(/Python Exceptions/i)).toBeInTheDocument();
    });

    // Find the "View" link for the first note
    const viewLinks = screen.getAllByRole('link', { name: /View/i });
    expect(viewLinks.length).toBeGreaterThan(0);

    // Check that the link points to /notes/:id
    const firstNoteLink = viewLinks[0];
    expect(firstNoteLink).toHaveAttribute('href', '/notes/note-123');
  });

  it('AC-9.2.4: Empty state displayed when no saved notes exist', async () => {
    // Mock empty notes response
    global.fetch.mockImplementation((url) => {
      if (url.includes('/notes/my')) {
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

    await waitFor(() => {
      expect(screen.getByText(/My Notes/i)).toBeInTheDocument();
    });

    // Click on "My Notes" tab
    const myNotesTab = screen.getByRole('button', { name: /My Notes/i });
    fireEvent.click(myNotesTab);

    // Wait for empty state message
    await waitFor(() => {
      expect(screen.getByText(/No saved notes yet/i)).toBeInTheDocument();
    });
  });

  it('AC-9.2.4: Class Notes tab is unaffected and still displays class_notes data', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Class Notes/i)).toBeInTheDocument();
    });

    // Click on "Class Notes" tab
    const classNotesTab = screen.getByRole('button', { name: /Class Notes/i });
    fireEvent.click(classNotesTab);

    // Wait for class notes to appear
    await waitFor(() => {
      expect(screen.getByText(/Lecture 1: Introduction/i)).toBeInTheDocument();
    });

    // Verify class note displays the class name
    expect(screen.getByText(/CS101/i)).toBeInTheDocument();

    // Verify fetch was called for student content endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/classes/student/content'),
      expect.any(Object)
    );
  });

  it('AC-9.2.4: My Notes tab count badge shows correct number of saved notes', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/My Notes/i)).toBeInTheDocument();
    });

    // Find the "My Notes" tab button and check for count badge
    const myNotesTab = screen.getByRole('button', { name: /My Notes/i });

    // The count should be displayed (2 notes in mockMyNotes)
    await waitFor(() => {
      expect(myNotesTab).toHaveTextContent('2');
    });
  });
});
