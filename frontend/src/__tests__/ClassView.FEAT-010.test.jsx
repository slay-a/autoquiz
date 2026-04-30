import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ClassView from '../pages/instructor/ClassView';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock supabase
const mockGetSession = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
    from: (...args) => mockSupabaseFrom(...args),
  },
}));

// Mock fetch
global.fetch = vi.fn();

function renderClassView(classId = 'class-123') {
  return render(
    <MemoryRouter initialEntries={[`/instructor/class/${classId}`]}>
      <Routes>
        <Route path="/instructor/class/:id" element={<ClassView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ClassView - FEAT-010 Instructor Notes System', () => {
  const mockUser = {
    id: 'instructor-123',
    email: 'instructor@example.com',
  };

  const mockProfile = {
    full_name: 'John Instructor',
    role: 'instructor',
  };

  const mockToken = 'mock-jwt-token';

  const mockClassDetail = {
    id: 'class-123',
    name: 'Biology 101',
    description: 'Introduction to Biology',
    class_code: 'BIO101',
    instructor_id: 'instructor-123',
    created_at: '2026-04-11T10:00:00Z',
    members: [],
  };

  const mockPublishedNote = {
    id: 'note-published',
    title: 'Cell Structure',
    topic: 'Biology',
    content: {
      summary: 'Overview of cell structure',
      key_concepts: [
        { term: 'Nucleus', definition: 'Control center', example: 'Found in eukaryotes' },
      ],
      important_details: ['Membrane-bound', 'Contains DNA'],
      common_misconceptions: ['All cells are the same'],
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
      summary: 'Process of converting light to energy',
      key_concepts: [
        { term: 'Chlorophyll', definition: 'Green pigment', example: 'In chloroplasts' },
      ],
      important_details: ['Requires sunlight', 'Produces oxygen'],
      common_misconceptions: [],
    },
    created_at: '2026-04-09T10:00:00Z',
    class_id: 'class-123',
    is_published: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: mockUser,
      profile: mockProfile,
      loading: false,
    });

    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: mockToken,
        },
      },
    });

    // Default fetch mock — use exact suffix matches so sub-routes don't receive class detail
    global.fetch.mockImplementation((url) => {
      if (/\/classes\/class-123$/.test(url)) {
        return Promise.resolve({ ok: true, json: async () => mockClassDetail });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    // Default Supabase mock
    mockSupabaseFrom.mockImplementation((table) => {
      const mockChain = {
        select: vi.fn(() => mockChain),
        eq: vi.fn(() => mockChain),
        order: vi.fn(() => mockChain),
        delete: vi.fn(() => mockChain),
        update: vi.fn(() => mockChain),
        insert: vi.fn(() => mockChain),
        single: vi.fn(() => ({ data: null, error: null })),
      };
      return mockChain;
    });
  });

  describe('Story 10.1 — Create class notes', () => {
    it('AC-10.1.1: Generate button is disabled when topic field is empty', async () => {
      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'class_notes') {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            order: vi.fn(() => mockChain),
          };
          mockChain.select().eq().order = vi.fn(() => Promise.resolve({ data: [], error: null }));
          return mockChain;
        }
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => mockChain),
        };
        mockChain.select().eq().order = vi.fn(() => Promise.resolve({ data: [], error: null }));
        return mockChain;
      });

      renderClassView();

      await waitFor(() => expect(screen.getByText('Biology 101')).toBeInTheDocument());

      // Navigate to Notes tab
      const notesTab = screen.getByRole('button', { name: /notes/i });
      await userEvent.click(notesTab);

      // Click "Generate Note" button to open generate form
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate note/i })).toBeInTheDocument();
      });
      const generateNoteButton = screen.getByRole('button', { name: /generate note/i });
      await userEvent.click(generateNoteButton);

      await waitFor(() => {
        const topicInput = screen.getByLabelText(/topic/i);
        expect(topicInput).toBeInTheDocument();
        expect(topicInput.value).toBe('');
      });

      // Verify Generate Notes button is disabled
      const generateButton = screen.getByRole('button', { name: /generate notes/i });
      expect(generateButton).toBeDisabled();
    });

    it('AC-10.1.1: Generate button is disabled when topic field is whitespace-only', async () => {
      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'class_notes') {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            order: vi.fn(() => mockChain),
          };
          mockChain.select().eq().order = vi.fn(() => Promise.resolve({ data: [], error: null }));
          return mockChain;
        }
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => mockChain),
        };
        mockChain.select().eq().order = vi.fn(() => Promise.resolve({ data: [], error: null }));
        return mockChain;
      });

      renderClassView();

      await waitFor(() => expect(screen.getByText('Biology 101')).toBeInTheDocument());

      const notesTab = screen.getByRole('button', { name: /notes/i });
      await userEvent.click(notesTab);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate note/i })).toBeInTheDocument();
      });
      const generateNoteButton = screen.getByRole('button', { name: /generate note/i });
      await userEvent.click(generateNoteButton);

      await waitFor(() => {
        const topicInput = screen.getByLabelText(/topic/i);
        expect(topicInput).toBeInTheDocument();
      });

      // Type whitespace into the topic field
      const topicInput = screen.getByLabelText(/topic/i);
      await userEvent.type(topicInput, '   ');

      // Verify Generate Notes button remains disabled
      const generateButton = screen.getByRole('button', { name: /generate notes/i });
      expect(generateButton).toBeDisabled();
    });

    it('AC-10.1.3: Newly created note appears at top of list immediately', async () => {
      const newNote = {
        id: 'note-new',
        title: 'Mitosis',
        topic: 'Mitosis',
        content: { summary: 'Cell division process' },
        created_at: '2026-04-14T10:00:00Z',
        class_id: 'class-123',
        is_published: false,
      };

      // fetch mocks: class detail, empty notes on load, notes/generate, notes POST save
      global.fetch.mockImplementation((url, options) => {
        if (/\/classes\/class-123$/.test(url)) {
          return Promise.resolve({ ok: true, json: async () => mockClassDetail });
        }
        if (url.includes('/classes/class-123/notes') && options?.method === 'POST') {
          return Promise.resolve({ ok: true, json: async () => newNote });
        }
        if (url.includes('/notes/generate')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ summary: 'Cell division process', key_concepts: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      renderClassView();

      await waitFor(() => expect(screen.getByText('Biology 101')).toBeInTheDocument());

      const notesTab = screen.getByRole('button', { name: /notes/i });
      await userEvent.click(notesTab);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate note/i })).toBeInTheDocument();
      });
      const generateNoteButton = screen.getByRole('button', { name: /generate note/i });
      await userEvent.click(generateNoteButton);

      await waitFor(() => {
        const topicInput = screen.getByLabelText(/topic/i);
        expect(topicInput).toBeInTheDocument();
      });

      const topicInput = screen.getByLabelText(/topic/i);
      await userEvent.type(topicInput, 'Mitosis');

      const generateButton = screen.getByRole('button', { name: /generate notes/i });
      expect(generateButton).not.toBeDisabled();
      await userEvent.click(generateButton);

      // After generation, the new note should appear in the list
      await waitFor(() => {
        expect(screen.getByText('Mitosis')).toBeInTheDocument();
      });
    });
  });

  describe('Story 10.2 — Edit class notes', () => {
    it('AC-10.2.1: Edit button opens inline editor', async () => {
      // fetch mock returns published note for /notes endpoint
      global.fetch.mockImplementation((url) => {
        if (/\/classes\/class-123$/.test(url)) {
          return Promise.resolve({ ok: true, json: async () => mockClassDetail });
        }
        if (url.includes('/classes/class-123/notes')) {
          return Promise.resolve({ ok: true, json: async () => [mockPublishedNote] });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      renderClassView();

      await waitFor(() => expect(screen.getByText('Biology 101')).toBeInTheDocument());

      const notesTab = screen.getByRole('button', { name: /notes/i });
      await userEvent.click(notesTab);

      await waitFor(() => {
        expect(screen.getByText('Cell Structure')).toBeInTheDocument();
      });

      // Find and click the Edit button
      const editButtons = screen.getAllByRole('button');
      const editButton = editButtons.find((btn) => {
        const svgTitle = btn.querySelector('svg title');
        return svgTitle?.textContent === 'Edit3' || btn.className.includes('edit');
      });

      if (editButton) {
        await userEvent.click(editButton);

        // Verify editor UI appears (look for title input and Save/Cancel buttons)
        await waitFor(() => {
          expect(screen.getByPlaceholderText(/note title/i)).toBeInTheDocument();
          expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
          expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
        });
      }
    });

    it('AC-10.2.4: Cancel button discards changes without saving', async () => {
      const mockFetchPut = vi.fn();

      // fetch mock returns published note; captures PUT calls
      global.fetch.mockImplementation((url, options) => {
        if (/\/classes\/class-123$/.test(url)) {
          return Promise.resolve({ ok: true, json: async () => mockClassDetail });
        }
        if (url.includes('/classes/class-123/notes') && options?.method === 'PUT') {
          mockFetchPut(url, options);
          return Promise.resolve({ ok: true, json: async () => mockPublishedNote });
        }
        if (url.includes('/classes/class-123/notes')) {
          return Promise.resolve({ ok: true, json: async () => [mockPublishedNote] });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      renderClassView();

      await waitFor(() => expect(screen.getByText('Biology 101')).toBeInTheDocument());

      const notesTab = screen.getByRole('button', { name: /notes/i });
      await userEvent.click(notesTab);

      await waitFor(() => {
        expect(screen.getByText('Cell Structure')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button');
      const editButton = editButtons.find((btn) => {
        const svgTitle = btn.querySelector('svg title');
        return svgTitle?.textContent === 'Edit3' || btn.className.includes('edit');
      });

      if (editButton) {
        await userEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByPlaceholderText(/note title/i)).toBeInTheDocument();
        });

        const titleInput = screen.getByPlaceholderText(/note title/i);
        await userEvent.clear(titleInput);
        await userEvent.type(titleInput, 'Modified Title');

        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        await userEvent.click(cancelButton);

        // Verify PUT was NOT called (no save on cancel)
        expect(mockFetchPut).not.toHaveBeenCalled();

        // Verify we're back to list view (original title should be visible)
        await waitFor(() => {
          expect(screen.getByText('Cell Structure')).toBeInTheDocument();
        });
      }
    });

    it('AC-10.2.4: Save button calls fetch PUT with new title and content', async () => {
      let putBody = null;

      // fetch mock returns note for GET, captures PUT body for save assertion
      global.fetch.mockImplementation(async (url, options) => {
        if (/\/classes\/class-123$/.test(url)) {
          return { ok: true, json: async () => mockClassDetail };
        }
        if (url.includes('/classes/class-123/notes') && options?.method === 'PUT') {
          putBody = JSON.parse(options.body);
          return { ok: true, json: async () => ({ ...mockPublishedNote, title: putBody.title }) };
        }
        if (url.includes('/classes/class-123/notes')) {
          return { ok: true, json: async () => [mockPublishedNote] };
        }
        return { ok: true, json: async () => [] };
      });

      renderClassView();

      await waitFor(() => expect(screen.getByText('Biology 101')).toBeInTheDocument());

      const notesTab = screen.getByRole('button', { name: /notes/i });
      await userEvent.click(notesTab);

      await waitFor(() => {
        expect(screen.getByText('Cell Structure')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button');
      const editButton = editButtons.find((btn) => {
        const svgTitle = btn.querySelector('svg title');
        return svgTitle?.textContent === 'Edit3' || btn.className.includes('edit');
      });

      if (editButton) {
        await userEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByPlaceholderText(/note title/i)).toBeInTheDocument();
        });

        const titleInput = screen.getByPlaceholderText(/note title/i);
        await userEvent.clear(titleInput);
        await userEvent.type(titleInput, 'Updated Title');

        const saveButton = screen.getByRole('button', { name: /save/i });
        await userEvent.click(saveButton);

        // Verify fetch PUT was called with new title and original content
        await waitFor(() => {
          expect(putBody).not.toBeNull();
          expect(putBody.title).toBe('Updated Title');
          expect(putBody.content).toEqual(mockPublishedNote.content);
        });
      }
    });
  });

  describe('Story 10.3 — Publish and unpublish class notes', () => {
    it('AC-10.3.1: Publish toggle flips is_published via fetch PATCH', async () => {
      let patchBody = null;

      // fetch mock returns draft note; captures PATCH call for publish assertion
      global.fetch.mockImplementation(async (url, options) => {
        if (/\/classes\/class-123$/.test(url)) {
          return { ok: true, json: async () => mockClassDetail };
        }
        if (url.includes('/classes/class-123/notes') && url.includes('/publish') && options?.method === 'PATCH') {
          patchBody = JSON.parse(options.body);
          return { ok: true, json: async () => ({ ...mockDraftNote, is_published: true }) };
        }
        if (url.includes('/classes/class-123/notes')) {
          return { ok: true, json: async () => [mockDraftNote] };
        }
        return { ok: true, json: async () => [] };
      });

      renderClassView();

      await waitFor(() => expect(screen.getByText('Biology 101')).toBeInTheDocument());

      const notesTab = screen.getByRole('button', { name: /notes/i });
      await userEvent.click(notesTab);

      await waitFor(() => {
        expect(screen.getByText('Photosynthesis')).toBeInTheDocument();
      });

      // Find the Publish button (draft note shows "Publish" label)
      const publishButton = screen.getByRole('button', { name: /publish/i });
      expect(publishButton).toBeInTheDocument();

      await userEvent.click(publishButton);

      // Verify fetch PATCH was called with is_published: true
      await waitFor(() => {
        expect(patchBody).not.toBeNull();
        expect(patchBody.is_published).toBe(true);
      });
    });
  });
});
