import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ClassNoteView from '../pages/ClassNoteView';

// Mock AuthContext (ClassNoteView no longer reads profile from context after migration)
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null, loading: false }),
}));

// Mock supabase — only auth.getSession is used after migration to fetch
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

function renderClassNoteView(noteId = 'note-123') {
  return render(
    <MemoryRouter initialEntries={[`/class-note/${noteId}`]}>
      <Routes>
        <Route path="/class-note/:id" element={<ClassNoteView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ClassNoteView - FEAT-010 Published Note Checks', () => {
  const mockPublishedNote = {
    id: 'note-published',
    title: 'Cell Structure',
    topic: 'Biology',
    content: {
      summary: 'Overview of cell structure and organelles',
      key_concepts: [
        { term: 'Nucleus', definition: 'Control center of the cell', example: 'Found in eukaryotes' },
        { term: 'Mitochondria', definition: 'Powerhouse of the cell', example: 'Produces ATP' },
      ],
      important_details: ['Membrane-bound organelles', 'Contains genetic material'],
      common_misconceptions: ['All cells are identical', 'Plant cells have no nucleus'],
      study_tips: ['Use diagrams', 'Compare prokaryotic vs eukaryotic'],
    },
    created_at: '2026-04-10T10:00:00Z',
    class_id: 'class-123',
    is_published: true,
  };

  const mockDraftNote = {
    id: 'note-draft',
    title: 'Photosynthesis',
    topic: 'Biology',
    content: {
      summary: 'Process of converting light energy to chemical energy',
      key_concepts: [
        { term: 'Chlorophyll', definition: 'Green pigment in plants', example: 'Found in chloroplasts' },
      ],
      important_details: ['Requires sunlight', 'Produces glucose and oxygen'],
      common_misconceptions: [],
    },
    created_at: '2026-04-09T10:00:00Z',
    class_id: 'class-123',
    is_published: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'mock-token' } } });
  });

  describe('AC-10.3.2: Unpublished notes access control', () => {
    it('renders error message when student views unpublished note', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'ROLE_FORBIDDEN', message: 'This note is not available.' } }),
      });

      renderClassNoteView('note-draft');

      await waitFor(() => {
        expect(screen.getByText(/this note is not available/i)).toBeInTheDocument();
      });

      expect(screen.queryByText('Photosynthesis')).not.toBeInTheDocument();
      expect(screen.queryByText(/process of converting light energy/i)).not.toBeInTheDocument();
    });

    it('renders note content when student views published note', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPublishedNote,
      });

      renderClassNoteView('note-published');

      await waitFor(() => {
        expect(screen.getByText('Cell Structure')).toBeInTheDocument();
      });

      expect(screen.getByText(/overview of cell structure/i)).toBeInTheDocument();
      expect(screen.getByText('Nucleus')).toBeInTheDocument();
      expect(screen.getByText(/control center of the cell/i)).toBeInTheDocument();
    });
  });

  describe('AC-10.3.3: Published notes are fully accessible', () => {
    it('renders all note sections when published', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPublishedNote,
      });

      renderClassNoteView('note-published');

      await waitFor(() => {
        expect(screen.getByText('Cell Structure')).toBeInTheDocument();
      });

      expect(screen.getByText(/overview of cell structure/i)).toBeInTheDocument();
      expect(screen.getByText('Nucleus')).toBeInTheDocument();
      expect(screen.getByText('Mitochondria')).toBeInTheDocument();
      expect(screen.getByText(/membrane-bound organelles/i)).toBeInTheDocument();
      expect(screen.getByText(/all cells are identical/i)).toBeInTheDocument();
      expect(screen.getByText(/use diagrams/i)).toBeInTheDocument();
    });
  });

  describe('Instructor access (bypass published check)', () => {
    it('instructor can view unpublished notes', async () => {
      // API returns the draft note for instructors (no 403)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockDraftNote,
      });

      renderClassNoteView('note-draft');

      await waitFor(() => {
        expect(screen.getByText('Photosynthesis')).toBeInTheDocument();
      });

      expect(screen.getByText(/process of converting light energy/i)).toBeInTheDocument();
      expect(screen.getByText('Chlorophyll')).toBeInTheDocument();
    });
  });

  describe('Not found handling', () => {
    it('renders not found message when note does not exist', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'CLASS_NOTE_NOT_FOUND', message: 'Note not found.' } }),
      });

      renderClassNoteView('note-nonexistent');

      await waitFor(() => {
        expect(screen.getByText(/note not found/i)).toBeInTheDocument();
      });
    });
  });
});
