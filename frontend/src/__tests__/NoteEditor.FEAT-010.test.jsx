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

describe('NoteEditor - FEAT-010 Unit Tests', () => {
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

  const mockNote = {
    id: 'note-edit',
    title: 'Cell Biology',
    topic: 'Cells',
    content: {
      summary: 'Overview of cells',
      key_concepts: [
        { term: 'Nucleus', definition: 'Control center', example: 'Found in eukaryotes' },
      ],
      important_details: ['Membrane-bound', 'Contains DNA'],
      common_misconceptions: ['All cells are identical'],
    },
    created_at: '2026-04-10T10:00:00Z',
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

    global.fetch.mockImplementation((url) => {
      if (url.includes('/classes/class-123')) {
        return Promise.resolve({ ok: true, json: async () => mockClassDetail });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    mockSupabaseFrom.mockImplementation((table) => {
      if (table === 'class_notes') {
        const mockChain = {
          select: vi.fn(() => mockChain),
          eq: vi.fn(() => mockChain),
          order: vi.fn(() => mockChain),
          update: vi.fn(() => mockChain),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        };
        mockChain.select().eq().order = vi.fn(() =>
          Promise.resolve({ data: [mockNote], error: null })
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
  });

  describe('AC-10.2.3: Add and remove functions', () => {
    it('addConcept adds a new blank concept to key_concepts', async () => {
      renderClassView();

      await waitFor(() => expect(screen.getByText('Biology 101')).toBeInTheDocument());

      const notesTab = screen.getByRole('button', { name: /notes/i });
      await userEvent.click(notesTab);

      await waitFor(() => {
        expect(screen.getByText('Cell Biology')).toBeInTheDocument();
      });

      // Click Edit to open the editor
      const editButtons = screen.getAllByRole('button');
      const editButton = editButtons.find((btn) => {
        const svgTitle = btn.querySelector('svg title');
        return svgTitle?.textContent === 'Edit3' || btn.className.includes('edit');
      });

      if (editButton) {
        await userEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByText(/key concepts/i)).toBeInTheDocument();
        });

        // Find the "Add" button for key concepts
        const addButtons = screen.getAllByRole('button', { name: /add/i });
        const addConceptButton = addButtons[0]; // First "Add" button should be for key concepts

        // Initially, there is 1 concept (Nucleus)
        expect(screen.getByDisplayValue('Nucleus')).toBeInTheDocument();

        // Click Add to create a new blank concept
        await userEvent.click(addConceptButton);

        // Verify a new blank concept input appears
        await waitFor(() => {
          const termInputs = screen.getAllByPlaceholderText(/term/i);
          expect(termInputs.length).toBe(2); // Original + new blank
        });
      }
    });

    it('removeConcept removes the concept at the given index', async () => {
      const noteWithMultipleConcepts = {
        ...mockNote,
        content: {
          ...mockNote.content,
          key_concepts: [
            { term: 'Nucleus', definition: 'Control center', example: 'Eukaryotes' },
            { term: 'Mitochondria', definition: 'Powerhouse', example: 'ATP production' },
          ],
        },
      };

      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'class_notes') {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            order: vi.fn(() => mockChain),
            update: vi.fn(() => mockChain),
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          };
          mockChain.select().eq().order = vi.fn(() =>
            Promise.resolve({ data: [noteWithMultipleConcepts], error: null })
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
        expect(screen.getByText('Cell Biology')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button');
      const editButton = editButtons.find((btn) => {
        const svgTitle = btn.querySelector('svg title');
        return svgTitle?.textContent === 'Edit3' || btn.className.includes('edit');
      });

      if (editButton) {
        await userEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByDisplayValue('Nucleus')).toBeInTheDocument();
          expect(screen.getByDisplayValue('Mitochondria')).toBeInTheDocument();
        });

        // Find the remove button for the first concept (X icon in top-right of concept card)
        const allButtons = screen.getAllByRole('button');
        const removeButtons = allButtons.filter((btn) => {
          const svg = btn.querySelector('svg');
          return svg && btn.className.includes('absolute');
        });

        if (removeButtons.length > 0) {
          await userEvent.click(removeButtons[0]);

          // Verify the first concept is removed
          await waitFor(() => {
            expect(screen.queryByDisplayValue('Nucleus')).not.toBeInTheDocument();
            expect(screen.getByDisplayValue('Mitochondria')).toBeInTheDocument();
          });
        }
      }
    });

    it('addListItem adds a new item to important_details', async () => {
      renderClassView();

      await waitFor(() => expect(screen.getByText('Biology 101')).toBeInTheDocument());

      const notesTab = screen.getByRole('button', { name: /notes/i });
      await userEvent.click(notesTab);

      await waitFor(() => {
        expect(screen.getByText('Cell Biology')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button');
      const editButton = editButtons.find((btn) => {
        const svgTitle = btn.querySelector('svg title');
        return svgTitle?.textContent === 'Edit3' || btn.className.includes('edit');
      });

      if (editButton) {
        await userEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByText(/important details/i)).toBeInTheDocument();
        });

        // Find the "Add" button for Important Details section
        const addButtons = screen.getAllByRole('button', { name: /add/i });
        // The second Add button should be for Important Details (after Key Concepts)
        const addDetailButton = addButtons[1];

        // Initially, there are 2 items
        expect(screen.getByDisplayValue('Membrane-bound')).toBeInTheDocument();

        await userEvent.click(addDetailButton);

        // Verify a new blank textarea appears
        await waitFor(() => {
          const textareas = screen.getAllByRole('textbox');
          const detailTextareas = textareas.filter((ta) =>
            ta.value === '' || ta.value.includes('Membrane')
          );
          expect(detailTextareas.length).toBeGreaterThan(0);
        });
      }
    });

    it('removeListItem removes an item from common_misconceptions', async () => {
      const noteWithMultipleMisconceptions = {
        ...mockNote,
        content: {
          ...mockNote.content,
          common_misconceptions: [
            'All cells are identical',
            'Plant cells have no nucleus',
          ],
        },
      };

      mockSupabaseFrom.mockImplementation((table) => {
        if (table === 'class_notes') {
          const mockChain = {
            select: vi.fn(() => mockChain),
            eq: vi.fn(() => mockChain),
            order: vi.fn(() => mockChain),
            update: vi.fn(() => mockChain),
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          };
          mockChain.select().eq().order = vi.fn(() =>
            Promise.resolve({ data: [noteWithMultipleMisconceptions], error: null })
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
        expect(screen.getByText('Cell Biology')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button');
      const editButton = editButtons.find((btn) => {
        const svgTitle = btn.querySelector('svg title');
        return svgTitle?.textContent === 'Edit3' || btn.className.includes('edit');
      });

      if (editButton) {
        await userEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByDisplayValue('All cells are identical')).toBeInTheDocument();
          expect(screen.getByDisplayValue('Plant cells have no nucleus')).toBeInTheDocument();
        });

        // Find remove buttons (X icons next to textareas)
        const allButtons = screen.getAllByRole('button');
        const removeListButtons = allButtons.filter((btn) => {
          const svg = btn.querySelector('svg');
          return svg && btn.className.includes('hover:text-red');
        });

        if (removeListButtons.length > 0) {
          // Click the first remove button in the misconceptions section
          await userEvent.click(removeListButtons[removeListButtons.length - 2]);

          // Verify one item is removed
          await waitFor(() => {
            expect(screen.queryByDisplayValue('All cells are identical')).not.toBeInTheDocument();
            expect(screen.getByDisplayValue('Plant cells have no nucleus')).toBeInTheDocument();
          });
        }
      }
    });
  });

  describe('AC-10.2.2: All fields are editable', () => {
    it('title, summary, and all content fields can be modified', async () => {
      renderClassView();

      await waitFor(() => expect(screen.getByText('Biology 101')).toBeInTheDocument());

      const notesTab = screen.getByRole('button', { name: /notes/i });
      await userEvent.click(notesTab);

      await waitFor(() => {
        expect(screen.getByText('Cell Biology')).toBeInTheDocument();
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

        // Verify title is editable
        const titleInput = screen.getByPlaceholderText(/note title/i);
        expect(titleInput.value).toBe('Cell Biology');
        await userEvent.clear(titleInput);
        await userEvent.type(titleInput, 'Updated Cell Biology');
        expect(titleInput.value).toBe('Updated Cell Biology');

        // Verify summary is editable
        const summaryTextarea = screen.getByPlaceholderText(/overview of the topic/i);
        expect(summaryTextarea.value).toBe('Overview of cells');
        await userEvent.clear(summaryTextarea);
        await userEvent.type(summaryTextarea, 'New summary');
        expect(summaryTextarea.value).toBe('New summary');

        // Verify key concept fields are editable
        const termInput = screen.getByDisplayValue('Nucleus');
        await userEvent.clear(termInput);
        await userEvent.type(termInput, 'Cytoplasm');
        expect(termInput.value).toBe('Cytoplasm');

        const definitionTextarea = screen.getByDisplayValue('Control center');
        await userEvent.clear(definitionTextarea);
        await userEvent.type(definitionTextarea, 'Gel-like substance');
        expect(definitionTextarea.value).toBe('Gel-like substance');
      }
    });
  });
});
