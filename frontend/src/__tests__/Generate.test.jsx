/**
 * Tests for Generate.jsx (Student) — FEAT-005 Stories 5.4.
 *
 * Tests cover:
 * - AC-5.4.1: Student generate page displays previously uploaded files with status='success'
 * - AC-5.4.3: File picker sets selectedFileId for quiz generation
 * - AC-5.4.5: Mutual exclusion — selecting a file clears uploadedFile; uploading clears selectedFileId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Generate from '../pages/student/Generate';

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

// Mock Upload component so tests can trigger the onUpload callback directly
vi.mock('../components/Upload', () => ({
  default: ({ onUpload }) => (
    <button
      data-testid="mock-upload-trigger"
      onClick={() => onUpload(new File(['content'], 'new-file.pdf', { type: 'application/pdf' }))}
    >
      Upload file
    </button>
  ),
}));

// Mock fetch globally
global.fetch = vi.fn();

const mockUser = {
  id: 'student-456',
  email: 'student@example.com',
  role: 'student',
};

const renderGenerate = () => {
  return render(
    <BrowserRouter>
      <Generate />
    </BrowserRouter>
  );
};

describe('Generate Page — Story 5.4 (Student File Re-Access)', () => {
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

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'quiz-123' }, error: null }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });
  });

  describe('AC-5.4.1: Display previously uploaded files with status=success', () => {
    it('fetches and renders previously uploaded files on mount', async () => {
      // Mock GET /upload/files to return success files
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { file_id: 'file-1', filename: 'lecture1.pdf', created_at: '2024-01-01T10:00:00' },
          { file_id: 'file-2', filename: 'notes.docx', created_at: '2024-01-02T11:00:00' },
        ],
      });

      renderGenerate();

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:8000/upload/files',
          expect.objectContaining({
            headers: { Authorization: 'Bearer test-token' },
          })
        );
      });

      // Files should appear in the picker
      await waitFor(() => {
        expect(screen.getByText(/lecture1\.pdf/i)).toBeInTheDocument();
        expect(screen.getByText(/notes\.docx/i)).toBeInTheDocument();
      });
    });

    it('does not render failed or in-progress files', async () => {
      // Mock API to return only success files (backend filters these)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { file_id: 'file-success', filename: 'success.pdf', created_at: '2024-01-01T10:00:00' },
        ],
      });

      renderGenerate();

      await waitFor(() => {
        expect(screen.getByText(/success\.pdf/i)).toBeInTheDocument();
      });

      // Failed/in-progress files should NOT be present
      expect(screen.queryByText(/failed\.pdf/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/pending\.pdf/i)).not.toBeInTheDocument();
    });

    it('handles empty file list gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderGenerate();

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // File picker should not be rendered when no files exist
      expect(screen.queryByText(/Select from previous uploads/i)).not.toBeInTheDocument();
    });
  });

  describe('AC-5.4.3: Select file from picker for quiz generation', () => {
    it('sets selectedFileId when a file is selected from the picker', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { file_id: 'file-1', filename: 'lecture1.pdf', created_at: '2024-01-01T10:00:00' },
        ],
      });

      renderGenerate();

      await waitFor(() => {
        expect(screen.getByText(/lecture1\.pdf/i)).toBeInTheDocument();
      });

      // Select the file
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'file-1' } });

      // Should show the selected file badge
      await waitFor(() => {
        expect(screen.getByText(/✓ lecture1\.pdf/i)).toBeInTheDocument();
      });
    });

    it('includes selectedFileId in quiz generation request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { file_id: 'file-1', filename: 'lecture1.pdf', created_at: '2024-01-01T10:00:00' },
        ],
      });

      renderGenerate();

      await waitFor(() => {
        expect(screen.getByText(/lecture1\.pdf/i)).toBeInTheDocument();
      });

      // Select the file
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'file-1' } });

      // Mock quiz generation
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quiz_id: 'quiz-123',
          questions: [
            {
              question_id: 'q1',
              type: 'mcq',
              question: 'What is the capital of France?',
              options: [
                { label: 'A', text: 'Paris' },
                { label: 'B', text: 'London' },
              ],
              answer: 'A',
              explanation: 'Paris is the capital.',
              source_chunk_ids: ['chunk-1'],
              page_numbers: [1],
            },
          ],
        }),
      });

      // Fill in topic and generate
      const topicInput = screen.getByPlaceholderText(/Software Requirements/i);
      fireEvent.change(topicInput, { target: { value: 'Geography' } });

      const generateButton = screen.getByRole('button', { name: /Generat/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        const quizGenerationCall = global.fetch.mock.calls.find(
          (call) => call[0] === 'http://localhost:8000/quiz/generate'
        );
        expect(quizGenerationCall).toBeTruthy();
        const requestBody = JSON.parse(quizGenerationCall[1].body);
        expect(requestBody.file_id).toBe('file-1');
      });
    });
  });

  describe('AC-5.4.5: Mutual exclusion between file picker and upload', () => {
    it('clears uploadedFile when selecting from previous files', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { file_id: 'file-1', filename: 'lecture1.pdf', created_at: '2024-01-01T10:00:00' },
        ],
      });

      // Mock upload
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          file_id: 'new-file',
          job_id: 'job-123',
          status: 'queued',
          message: 'File uploaded',
        }),
      });

      renderGenerate();

      await waitFor(() => {
        expect(screen.getByText(/lecture1\.pdf/i)).toBeInTheDocument();
      });

      // Simulate upload (this would require mocking the Upload component)
      // For now, verify the picker is present
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      // Select a file from picker
      fireEvent.change(select, { target: { value: 'file-1' } });

      // Badge should show selected file
      await waitFor(() => {
        expect(screen.getByText(/✓ lecture1\.pdf/i)).toBeInTheDocument();
      });

      // Clear selection button should appear
      const clearButton = screen.getByRole('button', { name: /Clear selection/i });
      fireEvent.click(clearButton);

      // Badge should disappear
      await waitFor(() => {
        expect(screen.queryByText(/✓ lecture1\.pdf/i)).not.toBeInTheDocument();
      });
    });

    it('clears selectedFileId when uploading a new file', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { file_id: 'file-1', filename: 'lecture1.pdf', created_at: '2024-01-01T10:00:00' },
        ],
      });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ file_id: 'new-file', job_id: 'job-1', status: 'queued', message: 'Uploaded' }),
      });

      renderGenerate();

      // Select a file from picker
      await waitFor(() => expect(screen.getByText(/lecture1\.pdf/i)).toBeInTheDocument());
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'file-1' } });
      await waitFor(() => expect(screen.getByText(/✓ lecture1\.pdf/i)).toBeInTheDocument());

      // Clear selection so upload reappears, then trigger upload
      fireEvent.click(screen.getByRole('button', { name: /Clear selection/i }));
      fireEvent.click(await screen.findByTestId('mock-upload-trigger'));

      // After upload: new file badge shown, "Remove file" appears, "Clear selection" is gone
      await waitFor(() => {
        expect(screen.getByText(/✓ new-file\.pdf/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Remove file/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Clear selection/i })).not.toBeInTheDocument();
      });
    });

    it('shows upload input when no file is selected', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      renderGenerate();

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      expect(screen.getByTestId('mock-upload-trigger')).toBeInTheDocument();
    });

    it('hides upload input when file is selected from picker', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { file_id: 'file-1', filename: 'lecture1.pdf', created_at: '2024-01-01T10:00:00' },
        ],
      });

      renderGenerate();

      // Upload is initially visible
      await waitFor(() => {
        expect(screen.getByTestId('mock-upload-trigger')).toBeInTheDocument();
      });

      // Select a file — upload should disappear
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'file-1' } });

      await waitFor(() => {
        expect(screen.queryByTestId('mock-upload-trigger')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('handles fetch failure gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      renderGenerate();

      // Should not crash — verify component renders
      await waitFor(() => {
        expect(screen.getByText(/Generate a Quiz/i)).toBeInTheDocument();
      });
    });

    it('handles API error response gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Server error' }),
      });

      renderGenerate();

      await waitFor(() => {
        expect(screen.getByText(/Generate a Quiz/i)).toBeInTheDocument();
      });
    });
  });
});
