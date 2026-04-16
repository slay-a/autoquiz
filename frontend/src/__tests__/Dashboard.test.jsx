import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import InstructorDashboard from '../pages/instructor/Dashboard';

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

// Mock fetch
global.fetch = vi.fn();

function renderDashboard() {
  return render(
    <BrowserRouter>
      <InstructorDashboard />
    </BrowserRouter>
  );
}

describe('InstructorDashboard - FEAT-002', () => {
  const mockUser = {
    id: 'instructor-123',
    email: 'instructor@example.com',
  };

  const mockProfile = {
    full_name: 'John Instructor',
    role: 'instructor',
  };

  const mockToken = 'mock-jwt-token';

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

    // Default mock for fetch (empty classes list)
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [],
      text: async () => '',
    });
  });

  // ── Story 2.1: Create a class ──────────────────────────────────

  it('AC-2.1.1: submit button is disabled when name is empty', async () => {
    renderDashboard();

    // Click "New Class" button
    const newClassButton = screen.getByRole('button', { name: /new class/i });
    await userEvent.click(newClassButton);

    // Verify form appears
    expect(screen.getByPlaceholderText(/class name/i)).toBeInTheDocument();

    // Submit button should be disabled when name is empty
    const submitButton = screen.getByRole('button', { name: /^create class$/i });
    expect(submitButton).toBeDisabled();
  });

  it('AC-2.1.1: submit button is disabled when name is whitespace-only', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // Open form
    const newClassButton = screen.getByRole('button', { name: /new class/i });
    await user.click(newClassButton);

    // Type whitespace into name field
    const nameInput = screen.getByPlaceholderText(/class name/i);
    await user.type(nameInput, '   ');

    // Submit button should still be disabled
    const submitButton = screen.getByRole('button', { name: /^create class$/i });
    expect(submitButton).toBeDisabled();
  });

  it('AC-2.1.1: submit button is enabled when name has content', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // Open form
    const newClassButton = screen.getByRole('button', { name: /new class/i });
    await user.click(newClassButton);

    // Type a valid name
    const nameInput = screen.getByPlaceholderText(/class name/i);
    await user.type(nameInput, 'CS 301');

    // Submit button should now be enabled
    const submitButton = screen.getByRole('button', { name: /^create class$/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('AC-2.1.4: new class appears in list after successful creation', async () => {
    const user = userEvent.setup();

    const existingClasses = [
      {
        id: 'class-1',
        name: 'Existing Class',
        description: 'Already here',
        class_code: 'EXIST1',
        instructor_id: 'instructor-123',
        created_at: '2026-04-10T10:00:00Z',
        member_count: 2,
      },
    ];

    const newClass = {
      id: 'class-2',
      name: 'New Class',
      description: 'Just created',
      class_code: 'NEW001',
      instructor_id: 'instructor-123',
      created_at: '2026-04-11T12:00:00Z',
      member_count: 0,
    };

    // Mock initial fetch (existing classes)
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => existingClasses,
    });

    renderDashboard();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Existing Class')).toBeInTheDocument();
    });

    // Mock POST /classes (create)
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => newClass,
    });

    // Mock fetch after creation (updated list)
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [newClass, ...existingClasses], // New class first (newest)
    });

    // Open form
    const newClassButton = screen.getByRole('button', { name: /new class/i });
    await user.click(newClassButton);

    // Fill in form
    const nameInput = screen.getByPlaceholderText(/class name/i);
    const descriptionInput = screen.getByPlaceholderText(/description/i);
    await user.type(nameInput, 'New Class');
    await user.type(descriptionInput, 'Just created');

    // Submit
    const submitButton = screen.getByRole('button', { name: /^create class$/i });
    await user.click(submitButton);

    // Wait for new class to appear at the top of the list
    await waitFor(() => {
      const classHeadings = screen.getAllByText('New Class');
      // Should appear in at least one place (class card)
      expect(classHeadings.length).toBeGreaterThan(0);
    });

    // Verify the POST request was made
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/classes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockToken}`,
        }),
        body: JSON.stringify({
          name: 'New Class',
          description: 'Just created',
        }),
      })
    );
  });

  it('AC-2.1.5: form resets after successful creation', async () => {
    const user = userEvent.setup();

    const newClass = {
      id: 'class-new',
      name: 'Test Class',
      description: 'Test Description',
      class_code: 'TEST01',
      instructor_id: 'instructor-123',
      created_at: '2026-04-11T12:00:00Z',
      member_count: 0,
    };

    // Mock initial empty list
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/no classes yet/i)).toBeInTheDocument();
    });

    // Mock POST /classes
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => newClass,
    });

    // Mock fetch after creation
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [newClass],
    });

    // Open form
    const newClassButton = screen.getByRole('button', { name: /new class/i });
    await user.click(newClassButton);

    // Fill in form
    const nameInput = screen.getByPlaceholderText(/class name/i);
    const descriptionInput = screen.getByPlaceholderText(/description/i);
    await user.type(nameInput, 'Test Class');
    await user.type(descriptionInput, 'Test Description');

    // Submit
    const submitButton = screen.getByRole('button', { name: /^create class$/i });
    await user.click(submitButton);

    // Wait for form to disappear (indicating reset)
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/class name/i)).not.toBeInTheDocument();
    });

    // Verify the form closed (new class button is visible again)
    expect(screen.getByRole('button', { name: /new class/i })).toBeInTheDocument();
  });

  // ── Story 2.2: View class list ─────────────────────────────────

  it('AC-2.2.1: fetches only classes for the current instructor', async () => {
    const instructorClasses = [
      {
        id: 'class-1',
        name: 'My Class 1',
        description: 'First class',
        class_code: 'CLS001',
        instructor_id: 'instructor-123',
        created_at: '2026-04-11T10:00:00Z',
        member_count: 5,
      },
      {
        id: 'class-2',
        name: 'My Class 2',
        description: null,
        class_code: 'CLS002',
        instructor_id: 'instructor-123',
        created_at: '2026-04-10T10:00:00Z',
        member_count: 3,
      },
    ];

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => instructorClasses,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('My Class 1')).toBeInTheDocument();
      expect(screen.getByText('My Class 2')).toBeInTheDocument();
    });

    // Verify fetch was called with Authorization header
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/classes',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': `Bearer ${mockToken}`,
        }),
      })
    );
  });

  it('AC-2.2.2: displays class name, description, class_code, and member_count', async () => {
    const classes = [
      {
        id: 'class-1',
        name: 'Biology 101',
        description: 'Introduction to Biology',
        class_code: 'BIO101',
        instructor_id: 'instructor-123',
        created_at: '2026-04-11T10:00:00Z',
        member_count: 12,
      },
    ];

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => classes,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Biology 101')).toBeInTheDocument();
      expect(screen.getByText('Introduction to Biology')).toBeInTheDocument();
      expect(screen.getByText('BIO101')).toBeInTheDocument();
      expect(screen.getByText(/12 students/i)).toBeInTheDocument();
    });
  });

  it('AC-2.2.3: classes are displayed in descending order by created_at', async () => {
    const classes = [
      {
        id: 'class-new',
        name: 'Newest Class',
        description: null,
        class_code: 'NEW001',
        instructor_id: 'instructor-123',
        created_at: '2026-04-11T12:00:00Z',
        member_count: 0,
      },
      {
        id: 'class-old',
        name: 'Oldest Class',
        description: null,
        class_code: 'OLD001',
        instructor_id: 'instructor-123',
        created_at: '2026-04-09T12:00:00Z',
        member_count: 5,
      },
    ];

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => classes,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Newest Class')).toBeInTheDocument();
    });

    // Get all class cards
    const classCards = screen.getAllByRole('link');
    // First card should be "Newest Class"
    expect(classCards[0]).toHaveTextContent('Newest Class');
    expect(classCards[1]).toHaveTextContent('Oldest Class');
  });

  it('AC-2.2.4: clicking a class card navigates to class detail', async () => {
    const classes = [
      {
        id: 'class-123',
        name: 'Test Class',
        description: null,
        class_code: 'TEST01',
        instructor_id: 'instructor-123',
        created_at: '2026-04-11T10:00:00Z',
        member_count: 2,
      },
    ];

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => classes,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Test Class')).toBeInTheDocument();
    });

    // Find the class card link
    const classCard = screen.getByRole('link', { name: /test class/i });
    expect(classCard).toHaveAttribute('href', '/instructor/class/class-123');
  });
});
