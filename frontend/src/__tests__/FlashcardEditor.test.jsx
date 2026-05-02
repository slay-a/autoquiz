import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import FlashcardEditor from '../pages/FlashcardEditor';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock react-router-dom
const mockUseParams = vi.fn();
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockUseParams(),
    useNavigate: () => mockNavigate,
  };
});

// Mock supabase — auth only (DESIGN.md §0 layer boundary)
const mockGetSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: 'test-token' } },
});
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    from: vi.fn((table) => { throw new Error(`LAYER VIOLATION: supabase.from("${table}") from FlashcardEditor`); }),
  },
}));

vi.mock('../lib/sharing', () => ({
  genShareCode: () => 'ABC123',
  copyToClipboard: vi.fn(),
  shareUrl: (type, id) => `https://example.com/${type}/${id}`,
}));

// Mock global fetch
global.fetch = vi.fn();

const mockUser = {
  id: 'user-1',
  email: 'student@test.com',
};

const mockFlashcardSet = {
  id: 'set-1',
  title: 'Biology 101 - Cell Structure',
  created_by: 'user-1',
  cards: [
    { front: 'What is a cell?', back: 'The basic unit of life', explanation: 'All living things are made of cells' },
    { front: 'What is DNA?', back: 'Genetic material', explanation: 'Deoxyribonucleic acid' },
  ],
  is_public: false,
  share_code: null,
};

function renderFlashcardEditor() {
  return render(
    <BrowserRouter>
      <FlashcardEditor />
    </BrowserRouter>
  );
}

describe('FlashcardEditor - FEAT-011', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
    });

    mockUseParams.mockReturnValue({ id: 'set-1' });

    // Default: successful GET fetch
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => mockFlashcardSet,
    });
  });

  // ── Story 11.3: Edit a flashcard set ──────────────────────────────

  it('AC-11.3.2: front and back fields are editable text inputs', async () => {
    const user = userEvent.setup();
    renderFlashcardEditor();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Find and click the edit button for the first card
    const cards = screen.getAllByText('What is a cell?');
    const firstCard = cards[0].closest('.card');
    const buttons = firstCard.querySelectorAll('button');
    const editButton = buttons[0]; // First button is edit (Edit3 icon)

    await user.click(editButton);

    // Front and back should now be in editable textareas
    await waitFor(() => {
      const textareas = screen.getAllByRole('textbox');
      const frontInput = textareas.find(t => t.value === 'What is a cell?');
      const backInput = textareas.find(t => t.value === 'The basic unit of life');
      expect(frontInput.tagName).toBe('TEXTAREA');
      expect(backInput.tagName).toBe('TEXTAREA');
    });
  });

  it('AC-11.3.2: editing front/back fields changes the displayed value', async () => {
    const user = userEvent.setup();
    renderFlashcardEditor();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Find and click the edit button (Edit3 icon) for the first card
    const cards = screen.getAllByText('What is a cell?');
    const firstCard = cards[0].closest('.card');
    const editButton = firstCard.querySelector('button'); // First button is edit

    await user.click(editButton);

    // Wait for edit mode - textareas should appear
    let frontInput, backInput;
    await waitFor(() => {
      const textareas = screen.getAllByRole('textbox');
      frontInput = textareas.find(t => t.value === 'What is a cell?');
      backInput = textareas.find(t => t.value === 'The basic unit of life');
      expect(frontInput).toBeInTheDocument();
      expect(backInput).toBeInTheDocument();
    });

    // Edit the front field
    await user.clear(frontInput);
    await user.type(frontInput, 'What is a eukaryotic cell?');

    // Edit the back field
    await user.clear(backInput);
    await user.type(backInput, 'A cell with a nucleus');

    // Verify the input values changed
    expect(frontInput).toHaveValue('What is a eukaryotic cell?');
    expect(backInput).toHaveValue('A cell with a nucleus');

    // Save the edit (click the Save button within the card's edit form)
    const saveButton = screen.getAllByRole('button', { name: /^save$/i })[1]; // Second "Save" is the one in the card
    await user.click(saveButton);

    // The edited values should now be displayed as plain text
    await waitFor(() => {
      expect(screen.getByText('What is a eukaryotic cell?')).toBeInTheDocument();
      expect(screen.getByText('A cell with a nucleus')).toBeInTheDocument();
    });
  });

  it('AC-11.3.3: Add Card button is disabled when front is empty', async () => {
    const user = userEvent.setup();
    renderFlashcardEditor();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Click "Add a card" button
    const addButton = screen.getByRole('button', { name: /add a card/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/question or term/i)).toBeInTheDocument();
    });

    // Fill only the back field
    const backInput = screen.getByPlaceholderText(/answer or definition/i);
    await user.type(backInput, 'Some answer');

    // Add Card button should be disabled
    const addCardButton = screen.getByRole('button', { name: /add card/i });
    expect(addCardButton).toBeDisabled();
  });

  it('AC-11.3.3: Add Card button is disabled when back is empty', async () => {
    const user = userEvent.setup();
    renderFlashcardEditor();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Click "Add a card"
    const addButton = screen.getByRole('button', { name: /add a card/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/question or term/i)).toBeInTheDocument();
    });

    // Fill only the front field
    const frontInput = screen.getByPlaceholderText(/question or term/i);
    await user.type(frontInput, 'Some question');

    // Add Card button should be disabled
    const addCardButton = screen.getByRole('button', { name: /add card/i });
    expect(addCardButton).toBeDisabled();
  });

  it('AC-11.3.3: Add Card button is enabled when both front and back are filled', async () => {
    const user = userEvent.setup();
    renderFlashcardEditor();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Click "Add a card"
    const addButton = screen.getByRole('button', { name: /add a card/i });
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/question or term/i)).toBeInTheDocument();
    });

    // Fill both fields
    const frontInput = screen.getByPlaceholderText(/question or term/i);
    const backInput = screen.getByPlaceholderText(/answer or definition/i);
    await user.type(frontInput, 'New question');
    await user.type(backInput, 'New answer');

    // Add Card button should now be enabled
    const addCardButton = screen.getByRole('button', { name: /add card/i });
    expect(addCardButton).not.toBeDisabled();
  });

  it('AC-11.3.4: saving calls PUT /flashcards/:id with updated title and cards', async () => {
    const user = userEvent.setup();

    // First call: GET set; second call: PUT save
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockFlashcardSet })
      .mockResolvedValueOnce({ ok: true, json: async () => mockFlashcardSet });

    renderFlashcardEditor();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Edit the title
    const titleInput = screen.getByDisplayValue('Biology 101 - Cell Structure');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated Biology Set');

    // Click the Save button in the header
    const saveButton = screen.getAllByRole('button', { name: /save/i })[0];
    await user.click(saveButton);

    // Verify PUT was called
    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(
        ([url, opts]) => opts?.method === 'PUT' && String(url).includes('/flashcards/set-1')
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body.title).toBe('Updated Biology Set');
      expect(Array.isArray(body.cards)).toBe(true);
    });
  });

  it('AC-11.3.4: after save, navigates to /flashcards/:id', async () => {
    const user = userEvent.setup();

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockFlashcardSet })
      .mockResolvedValueOnce({ ok: true, json: async () => mockFlashcardSet });

    renderFlashcardEditor();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Click Save
    const saveButton = screen.getAllByRole('button', { name: /save/i })[0];
    await user.click(saveButton);

    // Verify navigation
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/flashcards/set-1');
    });
  });

  it('AC-11.3.5: when set is owned by a different user, renders ownership error message', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...mockFlashcardSet, created_by: 'different-user' }),
    });

    renderFlashcardEditor();

    await waitFor(() => {
      expect(screen.getByText(/you don't have permission to edit this set/i)).toBeInTheDocument();
    });

    // Editor form should NOT be rendered
    expect(screen.queryByPlaceholderText(/question or term/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add a card/i })).not.toBeInTheDocument();
  });

  it('AC-11.3.5: when set is owned by current user, editor form is rendered', async () => {
    renderFlashcardEditor();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Editor controls should be present
    expect(screen.getByRole('button', { name: /add a card/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Biology 101 - Cell Structure')).toBeInTheDocument();

    // No error message
    expect(screen.queryByText(/you don't have permission/i)).not.toBeInTheDocument();
  });

  // ── Layer boundary test (DESIGN.md §0) ───────────────────────────

  it('DESIGN.md §0: fetches flashcard set via FastAPI (GET /flashcards/:id), not supabase.from', async () => {
    renderFlashcardEditor();

    await waitFor(() => {
      expect(screen.getByText('What is a cell?')).toBeInTheDocument();
    });

    // Verify fetch was called with the FastAPI endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/flashcards\/set-1/),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
        }),
      })
    );
  });
});
