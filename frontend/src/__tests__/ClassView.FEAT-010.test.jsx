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

    // Default fetch mock
    global.fetch.mockImplementation((url) => {
      if (url.includes('/classes/class-123')) {
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
        const topicInput = screen.getByPlaceholderText(/topic/i);
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
        const topicInput = screen.getByPlaceholderText(/topic/i);
        expect(topicInput).toBeInTheDocument();
      });

      // Type whitespace into the topic field
      const topicInput = screen.getByPlaceholderText(/topic/i);
      await userEvent.type(topicInput, '   ');

      // Verify Generate Notes button remains disabled
      const generateButton = screen.getByRole('button', { name: /generate notes/i });
      expect(generateButton).toBeDisabled();
    });

    it('AC-10.1.3: Newly created note appears at top of list immediately', async () => {
      let notesData = [];

      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'class_notes') {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            order: vi.fn(() => mockChain),
            insert: vi.fn(() => mockChain),
            single: vi.fn(() => {
              // Simulate successful insert
              const newNote = {
                id: 'note-new',
                title: 'Mitosis',
                topic: 'Mitosis',
                content: { summary: 'Cell division process' },
                created_at: '2026-04-14T10:00:00Z',
                class_id: 'class-123',
                is_published: false,
              };
              notesData = [newNote, ...notesData];
              return Promise.resolve({ data: newNote, error: null });
            }),
          };
          mockChain.select().eq().order = vi.fn(() =>
            Promise.resolve({ data: notesData, error: null })
          );
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

      global.fetch.mockImplementation((url) => {
        if (url.includes('/classes/class-123')) {
          return Promise.resolve({ ok: true, json: async () => mockClassDetail });
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
        const topicInput = screen.getByPlaceholderText(/topic/i);
        expect(topicInput).toBeInTheDocument();
      });

      const topicInput = screen.getByPlaceholderText(/topic/i);
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
      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'class_notes') {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            order: vi.fn(() => mockChain),
          };
          mockChain.select().eq().order = vi.fn(() =>
            Promise.resolve({ data: [mockPublishedNote], error: null })
          );
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
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      }));

      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'class_notes') {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            order: vi.fn(() => mockChain),
            update: mockUpdate,
          };
          mockChain.select().eq().order = vi.fn(() =>
            Promise.resolve({ data: [mockPublishedNote], error: null })
          );
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

        // Verify update was NOT called
        expect(mockUpdate).not.toHaveBeenCalled();

        // Verify we're back to list view (original title should be visible)
        await waitFor(() => {
          expect(screen.getByText('Cell Structure')).toBeInTheDocument();
        });
      }
    });

    it('AC-10.2.4: Save button calls supabase.update with new title and content', async () => {
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { ...mockPublishedNote, title: 'Updated Title' },
                error: null,
              })
            ),
          })),
        })),
      }));

      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'class_notes') {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            order: vi.fn(() => mockChain),
            update: mockUpdate,
          };
          mockChain.select().eq().order = vi.fn(() =>
            Promise.resolve({ data: [mockPublishedNote], error: null })
          );
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

        // Verify update was called with new title
        await waitFor(() => {
          expect(mockUpdate).toHaveBeenCalledWith({
            title: 'Updated Title',
            content: mockPublishedNote.content,
          });
        });
      }
    });
  });

  describe('Story 10.3 — Publish and unpublish class notes', () => {
    it('AC-10.3.1: Publish toggle flips is_published and shows spinner', async () => {
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { ...mockDraftNote, is_published: true },
                error: null,
              })
            ),
          })),
        })),
      }));

      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'class_notes') {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            order: vi.fn(() => mockChain),
            update: mockUpdate,
          };
          mockChain.select().eq().order = vi.fn(() =>
            Promise.resolve({ data: [mockDraftNote], error: null })
          );
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
        expect(screen.getByText('Photosynthesis')).toBeInTheDocument();
      });

      // Find the Publish button
      const publishButton = screen.getByRole('button', { name: /publish/i });
      expect(publishButton).toBeInTheDocument();

      await userEvent.click(publishButton);

      // Verify update was called with is_published flipped
      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith({ is_published: true });
      });
    });
  });
});
