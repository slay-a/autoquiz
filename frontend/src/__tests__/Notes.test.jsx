/**
 * Tests for Notes.jsx — FEAT-009 Story 9.1 and 9.2.
 *
 * Tests cover:
 * - AC-9.1.1: Generate button disabled when topic empty; enabled when topic has non-whitespace content
 * - AC-9.2.3: Save button appears after generation; is replaced by "Saved" indicator after save; Save button not clickable again
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Notes from '../pages/Notes';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock supabase
const mockGetSession = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

// Mock fetch globally
global.fetch = vi.fn();

const mockUser = {
  id: 'student-456',
  email: 'student@example.com',
  role: 'student',
};

const mockNotesResponse = {
  topic: "Python Exceptions",
  summary: "Python exceptions are a mechanism for handling errors at runtime.",
  key_concepts: [
    {
      term: "Exception",
      definition: "An error detected during execution",
      example: "ZeroDivisionError when dividing by zero"
    }
  ],
  important_details: ["All exceptions inherit from BaseException"],
  common_misconceptions: ["Catching Exception catches everything"],
  scope: {
    main_concepts_count: 1,
    estimated_questions: { min: 3, max: 8 },
    subtopics: ["Built-in exceptions"]
  },
  study_tips: ["Practice writing custom exceptions"],
  source_pages: []
};

const renderNotes = () => {
  return render(
    <BrowserRouter>
      <Notes />
    </BrowserRouter>
  );
};

describe('Notes Page — Story 9.1 (Generate)', () => {
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

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockNotesResponse,
    });
  });

  it('AC-9.1.1: Generate button is disabled when topic field is empty', () => {
    renderNotes();

    const generateButton = screen.getByRole('button', { name: /Generate Notes/i });

    // Initially, topic is empty, so button should be disabled
    expect(generateButton).toBeDisabled();
  });

  it('AC-9.1.1: Generate button is disabled when topic is whitespace-only', () => {
    renderNotes();

    const topicInput = screen.getByPlaceholderText(/Enter a topic/i);
    const generateButton = screen.getByRole('button', { name: /Generate Notes/i });

    // Type whitespace-only content
    fireEvent.change(topicInput, { target: { value: '   \n\t  ' } });

    // Button should still be disabled
    expect(generateButton).toBeDisabled();
  });

  it('AC-9.1.1: Generate button is enabled when topic has non-whitespace content', () => {
    renderNotes();

    const topicInput = screen.getByPlaceholderText(/Enter a topic/i);
    const generateButton = screen.getByRole('button', { name: /Generate Notes/i });

    // Type valid topic
    fireEvent.change(topicInput, { target: { value: 'Python Exceptions' } });

    // Button should now be enabled
    expect(generateButton).not.toBeDisabled();
  });

  it('generates notes when Generate button is clicked', async () => {
    renderNotes();

    const topicInput = screen.getByPlaceholderText(/Enter a topic/i);
    const generateButton = screen.getByRole('button', { name: /Generate Notes/i });

    // Enter topic and generate
    fireEvent.change(topicInput, { target: { value: 'Python Exceptions' } });
    fireEvent.click(generateButton);

    // Wait for notes to appear
    await waitFor(() => {
      expect(screen.getByText(/Topic Scope/i)).toBeInTheDocument();
    });

    // Verify notes content is displayed
    expect(screen.getByText(/Python exceptions are a mechanism/i)).toBeInTheDocument();
    // Verify at least one key concept is shown
    expect(screen.getByText(/An error detected during execution/i)).toBeInTheDocument();
  });
});

describe('Notes Page — Story 9.2 (Save)', () => {
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

    // Mock generate endpoint
    global.fetch.mockImplementation((url) => {
      if (url.includes('/notes/generate')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockNotesResponse,
        });
      }
      if (url.includes('/notes/save')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'note-123',
            title: 'Python Exceptions',
            topic: 'Python Exceptions',
            created_at: '2024-01-15T10:00:00Z',
          }),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  it('AC-9.2.3: Save button appears after notes generation', async () => {
    renderNotes();

    const topicInput = screen.getByPlaceholderText(/Enter a topic/i);
    const generateButton = screen.getByRole('button', { name: /Generate Notes/i });

    // Generate notes
    fireEvent.change(topicInput, { target: { value: 'Python Exceptions' } });
    fireEvent.click(generateButton);

    // Wait for notes and Save button to appear
    await waitFor(() => {
      expect(screen.getByText(/Topic Scope/i)).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /Save Notes/i });
    expect(saveButton).toBeInTheDocument();
  });

  it('AC-9.2.3: Save button is replaced by "Saved" indicator after save', async () => {
    renderNotes();

    const topicInput = screen.getByPlaceholderText(/Enter a topic/i);
    const generateButton = screen.getByRole('button', { name: /Generate Notes/i });

    // Generate notes
    fireEvent.change(topicInput, { target: { value: 'Python Exceptions' } });
    fireEvent.click(generateButton);

    // Wait for Save button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Notes/i })).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /Save Notes/i });

    // Click Save
    fireEvent.click(saveButton);

    // Wait for "Saved" indicator to replace button
    await waitFor(() => {
      expect(screen.getByText(/Saved/i)).toBeInTheDocument();
    });

    // Save button should no longer be present
    expect(screen.queryByRole('button', { name: /Save Notes/i })).not.toBeInTheDocument();
  });

  it('AC-9.2.3: Saved indicator is not clickable', async () => {
    renderNotes();

    const topicInput = screen.getByPlaceholderText(/Enter a topic/i);
    const generateButton = screen.getByRole('button', { name: /Generate Notes/i });

    // Generate notes
    fireEvent.change(topicInput, { target: { value: 'Python Exceptions' } });
    fireEvent.click(generateButton);

    // Wait for Save button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Notes/i })).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /Save Notes/i });
    fireEvent.click(saveButton);

    // Wait for "Saved" indicator
    await waitFor(() => {
      expect(screen.getByText(/Saved/i)).toBeInTheDocument();
    });

    // The "Saved" text should be in a non-button element
    const savedElement = screen.getByText(/Saved/i);
    expect(savedElement.tagName).not.toBe('BUTTON');
  });

  it('AC-9.2.3: Save button reappears when generating new notes', async () => {
    renderNotes();

    const topicInput = screen.getByPlaceholderText(/Enter a topic/i);
    const generateButton = screen.getByRole('button', { name: /Generate Notes/i });

    // Generate first set of notes
    fireEvent.change(topicInput, { target: { value: 'Python Exceptions' } });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Notes/i })).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /Save Notes/i });
    fireEvent.click(saveButton);

    // Wait for "Saved" indicator
    await waitFor(() => {
      expect(screen.getByText(/Saved/i)).toBeInTheDocument();
    });

    // Generate new notes
    fireEvent.change(topicInput, { target: { value: 'Data Structures' } });
    fireEvent.click(generateButton);

    // Save button should reappear (saved state reset)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Notes/i })).toBeInTheDocument();
    });

    // "Saved" indicator should no longer be present
    expect(screen.queryByText(/Saved/i)).not.toBeInTheDocument();
  });
});
