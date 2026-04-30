# AutoQuiz — User Stories

> **Purpose:** Living requirements reference for all AutoQuiz features. New stories are
> appended here as features are defined. Acceptance criteria are quantifiable and
> verifiable — each AC maps to a specific, observable behaviour in the code or UI.
>
> **Scope:** All features, past and future. Stories added before implementation serve as
> the specification the prototyper builds against. Stories added retroactively document
> existing behaviour with the same authority.
>
> **Audience:** `autoquiz-req-validator` uses ACs as PASS/FAIL verdicts for every
> feature, regardless of when the story was written. `autoquiz-design-validator` uses
> these to understand intended behaviour. Append new feature groups at the bottom;
> do not modify or remove existing stories once a feature is in production.

---

## Feature Group 1 — Authentication & Session Management

### Story 1.1 — Registration

**Status: Verified**

**As a** new user,
**I want** to create an account with my name, email, password, and role,
**so that** I can access the features appropriate to my role.

**Acceptance Criteria:**
- AC-1.1.1: The registration form collects `full_name`, `email`, `password`, and `role` (`instructor` or `student`). Submission is blocked if any field is empty.
- AC-1.1.2: On successful registration, a row is inserted into `profiles` with the submitted `full_name`, `email`, and `role`. The `id` matches the Supabase Auth user ID.
- AC-1.1.3: After registration, the user is redirected to the role-appropriate dashboard: `/instructor` for instructors, `/student` for students.
- AC-1.1.4: If the email is already registered, the form displays an error message and does not navigate away.

---

### Story 1.2 — Login

**Status: Verified**

**As a** returning user,
**I want** to log in with my email and password,
**so that** I can resume my session.

**Acceptance Criteria:**
- AC-1.2.1: The login form collects `email` and `password`. Submission is blocked if either field is empty.
- AC-1.2.2: On successful login, the user is redirected to `/instructor` if `profile.role === 'instructor'`, or `/student` if `profile.role === 'student'`.
- AC-1.2.3: If credentials are invalid, the form displays an error message and remains on `/login`.
- AC-1.2.4: A logged-in user who navigates to `/login` is immediately redirected to their role-appropriate dashboard without seeing the login form.

---

### Story 1.3 — Session persistence

**Status: Verified**

**As a** logged-in user,
**I want** my session to persist when I reload the page or close and reopen the browser,
**so that** I do not have to log in repeatedly.

**Acceptance Criteria:**
- AC-1.3.1: On page reload, the app reads the Supabase session from `localStorage` (key prefixed `sb-*-auth-token`) without making a network request during the initial render.
- AC-1.3.2: If the stored session has more than 60 seconds remaining, the user is treated as authenticated immediately — the loading spinner is not shown.
- AC-1.3.3: If the stored session is expired or absent, the user is redirected to `/login`.
- AC-1.3.4: The user's `profile` (including `role`) is cached in `localStorage` under the key `aq_profile` and restored synchronously on reload.

---

### Story 1.4 — Logout

**Status: Verified**

**As a** logged-in user,
**I want** to log out,
**so that** my session is cleared and the next user of this device cannot access my account.

**Acceptance Criteria:**
- AC-1.4.1: Clicking the logout button calls Supabase `signOut()`, clears the `aq_profile` key from `localStorage`, and redirects the user to `/login`.
- AC-1.4.2: After logout, navigating to any protected route (`/instructor`, `/student`, etc.) redirects to `/login`.

---

### Story 1.5 — Role-based access control

**Status: Verified**

**As** the system,
**I want** to prevent users from accessing routes intended for the other role,
**so that** students cannot reach instructor pages and vice versa.

**Acceptance Criteria:**
- AC-1.5.1: Any route wrapped in `<ProtectedRoute allowedRole="instructor">` redirects a student to `/student`.
- AC-1.5.2: Any route wrapped in `<ProtectedRoute allowedRole="student">` redirects an instructor to `/instructor`.
- AC-1.5.3: Any route wrapped in `<ProtectedRoute>` (no role specified) redirects an unauthenticated user to `/login`.
- AC-1.5.4: While `AuthContext` is loading, protected routes render a spinner and do not redirect prematurely.

---

## Feature Group 2 — Class Management (Instructor)

### Story 2.1 — Create a class

**Status: Verified**

**As an** instructor,
**I want** to create a class with a name and optional description,
**so that** I have a space to organise materials and students.

**Acceptance Criteria:**
- AC-2.1.1: The create class form requires a `name` field. The submit button is disabled when `name` is empty or whitespace-only.
- AC-2.1.2: On submission, a row is inserted into `classes` with `name`, `description` (nullable), `instructor_id` set to the current user's ID, and a `class_code` that is exactly 6 uppercase alphanumeric characters.
- AC-2.1.3: `class_code` is unique across all classes. If a collision occurs, a new code is generated.
- AC-2.1.4: The newly created class appears at the top of the instructor's class list immediately after creation, without a full page reload.
- AC-2.1.5: The create class form resets to empty after successful submission.

---

### Story 2.2 — View class list

**Status: Verified**

**As an** instructor,
**I want** to see all the classes I have created along with their member counts,
**so that** I can navigate to the one I want to manage.

**Acceptance Criteria:**
- AC-2.2.1: The instructor dashboard fetches only classes where `instructor_id` equals the current user's ID.
- AC-2.2.2: Each class card displays the class `name`, `description` (if present), `class_code`, and the count of rows in `class_members` for that class.
- AC-2.2.3: Classes are displayed in descending order of `created_at` (newest first).
- AC-2.2.4: Clicking a class card navigates to `/instructor/class/:id`.

---

### Story 2.3 — View class detail

**Status: Verified**

**As an** instructor,
**I want** to see the full detail of a class including its members, files, notes, and quizzes,
**so that** I can manage all class resources from one place.

**Acceptance Criteria:**
- AC-2.3.1: The class detail page (`/instructor/class/:id`) displays the class `name`, `class_code`, and `description`.
- AC-2.3.2: The page shows a list of enrolled students (rows in `class_members` joined to `profiles`).
- AC-2.3.3: The instructor can copy the `class_code` to the clipboard from this page.
- AC-2.3.4: The page provides access to file upload, notes creation, and quiz sharing for the class.

---

## Feature Group 3 — Class Membership (Student)

### Story 3.1 — Join a class

**Status: Verified**

**As a** student,
**I want** to join a class by entering a class code,
**so that** I can access the materials and quizzes my instructor has shared.

**Acceptance Criteria:**
- AC-3.1.1: The student dashboard provides an input field and button to join a class by `class_code`. The button is disabled when the input is empty.
- AC-3.1.2: On submission, the system looks up `classes` where `class_code` matches the input (case-insensitive). If found, a row is inserted into `class_members` with `class_id` and `student_id`.
- AC-3.1.3: If the class code does not match any class, the UI displays an error message: the student is not redirected.
- AC-3.1.4: If the student is already a member of the class, the system does not insert a duplicate row and displays an appropriate message.
- AC-3.1.5: After successfully joining, the new class appears in the student's class list without a full page reload.

---

### Story 3.2 — View class content as a student

**Status: Verified**

**As a** student,
**I want** to see the quizzes and notes my instructor has shared for each class I'm in,
**so that** I can study the assigned materials.

**Acceptance Criteria:**
- AC-3.2.1: The student dashboard displays only quizzes from joined classes where `is_shared = true`. Quizzes with `is_shared = false` are never shown to students.
- AC-3.2.2: The student dashboard displays only notes from joined classes where `is_published = true`. Unpublished notes are never shown to students.
- AC-3.2.3: Each shared quiz and published note is labelled with the name of the class it belongs to.
- AC-3.2.4: Clicking a shared quiz navigates to `/quiz/:id`. Clicking a published note navigates to `/class-note/:id`.

---

## Feature Group 4 — LlamaIndex Ingestion Pipeline

### Story 4.1 — LlamaIndex-based document parsing

**Status: Verified**

**As the system**,
**I want** document files to be parsed using LlamaIndex readers,
**so that** text extraction is handled by a maintained library rather than bespoke PyMuPDF/python-docx/python-pptx code.

**Acceptance Criteria:**
- AC-4.1.1: `backend/app/utils/parsers.py` uses `llama_index.readers.file` readers (`PDFReader`, `DocxReader`, `PptxReader`) to extract content from uploaded files.
- AC-4.1.2: Each reader returns a list of LlamaIndex `Document` objects with `page_label` (or equivalent) populated in node metadata.
- AC-4.1.3: `.pdf`, `.docx`, and `.pptx` extensions are the only accepted file types; all others raise a `ValueError` with the `extract|` stage prefix.
- AC-4.1.4: The old custom `parse_pdf`, `parse_docx`, `parse_pptx` functions and `fitz`/`docx`/`pptx` direct imports are removed from `parsers.py`.

---

### Story 4.2 — LlamaIndex SentenceSplitter for chunking

**Status: Verified**

**As the system**,
**I want** parsed documents to be chunked using LlamaIndex's `SentenceSplitter`,
**so that** chunk boundaries are semantically coherent rather than split on raw word counts.

**Acceptance Criteria:**
- AC-4.2.1: `backend/app/services/ingestion.py` creates a `SentenceSplitter` with `chunk_size=settings.chunk_size_tokens` and `chunk_overlap=settings.chunk_overlap_tokens`.
- AC-4.2.2: `SentenceSplitter.get_nodes_from_documents()` replaces the custom `clean_text`, `detect_sections`, and `chunk_sections` functions.
- AC-4.2.3: The custom `clean_text`, `detect_sections`, and `chunk_sections` functions are removed from `ingestion.py`.
- AC-4.2.4: Each resulting `TextNode` has non-empty `text`.

---

### Story 4.3 — TextNode → chunks table mapping

**Status: Verified**

**As the system**,
**I want** LlamaIndex `TextNode` objects to be mapped to the existing `chunks` table schema,
**so that** no database schema changes are required and all downstream retrieval logic continues to work unchanged.

**Acceptance Criteria:**
- AC-4.3.1: `ingest_document` returns a list of dicts with keys `chunk_id`, `file_id`, `section_id`, `section_title`, `page_numbers`, `text` — identical shape to the existing contract.
- AC-4.3.2: `chunk_id` is a new `uuid4` string per node.
- AC-4.3.3: `page_numbers` is populated from `node.metadata.get("page_label")` if present, defaulting to `[1]` if absent.
- AC-4.3.4: `section_title` is populated from `node.metadata.get("section_title")` if present, defaulting to `None`.
- AC-4.3.5: No LlamaIndex `VectorStoreIndex`, `StorageContext`, or `SupabaseVectorStore` classes are used — storage is written directly to the `chunks` table by the Celery worker.

---

## Feature Group 5 — File Upload & Processing Pipeline

### Story 5.1 — Upload a document

**Status: Verified**

**As a** user (instructor or student),
**I want** to upload a course document (PDF, DOCX, or PPTX),
**so that** the system can generate quizzes and notes grounded in its content.

**Acceptance Criteria:**
- AC-5.1.1: The upload component accepts only files with extensions `.pdf`, `.docx`, or `.pptx`. Files with any other extension are rejected before upload with an error message.
- AC-5.1.2: Files larger than 50MB are rejected with HTTP 413. The UI displays an error message.
- AC-5.1.3: On successful upload, the file is stored in Supabase Storage under the path `{file_id}/{filename}` in the `uploads` bucket.
- AC-5.1.4: A row is inserted into `uploaded_files` with `file_id`, `filename`, and `uploaded_by` set to the current user's ID.
- AC-5.1.5: A row is inserted into `processing_jobs` with `status = 'queued'` and `stage = 'upload'`. The `job_id` is returned to the client.

---

### Story 5.2 — Track processing status

**Status: Verified**

**As a** user,
**I want** to see the processing status of my uploaded document,
**so that** I know when it is ready to use for quiz generation.

**Acceptance Criteria:**
- AC-5.2.1: The client can poll `GET /upload/status/{job_id}` to retrieve the current job status.
- AC-5.2.2: The `status` field progresses through: `queued` → `in_progress` → `success` or `failed`.
- AC-5.2.3: The `stage` field reflects the current pipeline step: `upload`, `extract`, `clean`, `section`, or `chunk`.
- AC-5.2.4: If processing fails, `status = 'failed'` and `error_message` contains a human-readable description. `error_code` contains a machine-readable code.
- AC-5.2.5: The `updated_at` timestamp is automatically refreshed on every status change via the `jobs_updated_at` database trigger.

---

### Story 5.3 — Re-access previously uploaded files for generation (Instructor)

**Status: Verified**

**As an** instructor,
**I want** to select a file I have already uploaded to a class without re-uploading it,
**so that** I can generate quizzes and notes from the same document multiple times without redundant uploads.

> **Note:** This behaviour is already implemented. It is documented here retroactively because it was absent from the original user stories.

**Acceptance Criteria:**
- AC-5.3.1: The class detail page displays a list of files previously uploaded to that class where the corresponding `processing_jobs` row has `status = 'success'`.
- AC-5.3.2: Each file entry displays the `filename` and `created_at` timestamp from `uploaded_files`.
- AC-5.3.3: The instructor can select a file from this list to use as the `file_id` source for quiz or notes generation — no re-upload is required.
- AC-5.3.4: The file list is scoped to the class context — only files associated with that class are shown, not files from other classes.

---

### Story 5.4 — Re-access previously uploaded files for generation (Student)

**As a** student,
**I want** to select a file I have already uploaded without re-uploading it,
**so that** I can generate quizzes and notes from the same document multiple times without redundant uploads.

> **Note:** This behaviour does not yet exist for students. Instructors have an equivalent feature (Story 5.3). This story defines the intended behaviour to be implemented.

**Acceptance Criteria:**
- AC-5.4.1: The student generate page displays a list of files the student has previously uploaded where the corresponding `processing_jobs` row has `status = 'success'`.
- AC-5.4.2: Each file entry displays the `filename` and `created_at` timestamp from `uploaded_files`.
- AC-5.4.3: The student can select a file from this list to use as the `file_id` source for quiz or notes generation — no re-upload is required.
- AC-5.4.4: The file list is scoped to the current student — only files where `uploaded_by` matches the authenticated user's ID are shown.
- AC-5.4.5: The file picker and the upload component coexist on the same page. Selecting an existing file dismisses/disables the upload input, and vice versa.

---

## Feature Group 6 — Quiz Generation

### Story 6.1 — Generate a quiz from uploaded material

**Status: Verified**

**As a** student,
**I want** to generate a quiz on a topic from a document I have uploaded,
**so that** I can test my understanding of the course content.

**Acceptance Criteria:**
- AC-6.1.1: The quiz generation request requires a non-empty `topic`. A request with an empty or whitespace-only topic returns HTTP 400.
- AC-6.1.2: When `file_id` is provided, the system retrieves the top 12 most relevant chunks from that file via hybrid search (vector + keyword) before generating questions.
- AC-6.1.3: When `file_id` is provided but no relevant content is found and `outside_sources = false`, the API returns HTTP 404 with a descriptive message.
- AC-6.1.4: The response contains a `questions` array where each item includes: `question_id`, `type`, `question`, `answer`, `explanation`, `source_chunk_ids`, and `page_numbers`. MCQ items also include `options` (array of `{label, text}`).
- AC-6.1.5: The number of questions in the response matches the `num_questions` parameter (default: 5).

---

### Story 6.2 — Select difficulty level

**Status: Verified**

**As a** student,
**I want** to choose the difficulty of the generated quiz (easy, medium, or hard),
**so that** the questions match my current study level.

**Acceptance Criteria:**
- AC-6.2.1: The `difficulty` parameter accepts exactly three values: `"easy"`, `"medium"`, `"hard"`. Any other value returns HTTP 422.
- AC-6.2.2: `difficulty` defaults to `"medium"` when omitted from the request.
- AC-6.2.3: The chosen difficulty is reflected in the LLM prompt sent to GPT-4o.
- AC-6.2.4: The `difficulty` value is included in the `QuizResponse` body.

---

### Story 6.3 — Generate a quiz using general knowledge

**Status: Verified**

**As a** student,
**I want** to generate a quiz on a topic without uploading a document,
**so that** I can study any subject even without course materials.

**Acceptance Criteria:**
- AC-6.3.1: When `outside_sources = true` and no `file_id` is provided, the system generates questions using GPT-4o's general knowledge without retrieving any chunks.
- AC-6.3.2: When `outside_sources = true` and a `file_id` is provided, the system uses both retrieved chunks and GPT-4o's general knowledge. Questions derived from outside the document have `[Outside Source]` prepended to their `explanation`.
- AC-6.3.3: When no `file_id` is provided and `outside_sources = false`, the system generates questions from general knowledge (no 404 is raised — the absence of a file is treated as an outside-sources request).

---

## Feature Group 7 — Quiz Study & Saving

### Story 7.1 — Study a quiz

**Status: Verified**

**As a** student,
**I want** to open a saved quiz and answer its questions,
**so that** I can test my knowledge.

**Acceptance Criteria:**
- AC-7.1.1: The quiz study page (`/quiz/:id`) loads the quiz from `saved_quizzes` by ID. If the ID does not exist, the page shows an appropriate message.
- AC-7.1.2: MCQ questions display all answer options labelled A, B, C, D. The student can select one option.
- AC-7.1.3: After submitting an answer, the correct answer and explanation are revealed. The student cannot change their answer after submission.
- AC-7.1.4: True/false questions present exactly two options: `True` and `False`.
- AC-7.1.5: Short answer questions display an input field for the student's response and reveal the model answer on submission.

---

### Story 7.2 — Save a generated quiz

**Status: Verified**

**As a** student,
**I want** to save a quiz I have just generated,
**so that** I can return to it later or share it.

**Acceptance Criteria:**
- AC-7.2.1: After a quiz is generated, a Save button is available. Clicking it inserts a row into `saved_quizzes` with `title`, `topic`, `difficulty`, `file_id` (nullable), `created_by`, `questions`, and `is_shared = false`.
- AC-7.2.2: The `title` is auto-generated in the format `{topic} — {difficulty}`.
- AC-7.2.3: The Save button is replaced by a confirmation indicator after successful save. It is not clickable again for the same quiz.
- AC-7.2.4: The saved quiz appears on the student dashboard under the quizzes tab.

---

### Story 7.3 — Regenerate a quiz

**Status: Verified**

**As a** student,
**I want** to regenerate a new version of a quiz on the same topic,
**so that** I get fresh questions to avoid memorising answers.

**Acceptance Criteria:**
- AC-7.3.1: The quiz study page provides a Regenerate button. Clicking it sends a new `POST /quiz/generate` request using the same `topic`, `num_questions`, `difficulty`, `question_types`, `outside_sources`, and `file_id` as the original quiz.
- AC-7.3.2: On success, the regenerated quiz is saved as a new row in `saved_quizzes` with `title` suffixed `(v2)`.
- AC-7.3.3: The page navigates to the new quiz's URL (`/quiz/:new_id`) after saving.

---

## Feature Group 8 — Quiz Sharing (Instructor)

### Story 8.1 — Share a quiz with a class

**Status: Verified**

**As an** instructor,
**I want** to share a saved quiz with my class,
**so that** students can access and study it from their dashboard.

**Acceptance Criteria:**
- AC-8.1.1: The class detail page displays saved quizzes associated with the class. Each quiz has a share toggle.
- AC-8.1.2: Toggling share on sets `is_shared = true` in `saved_quizzes` for that quiz. Toggling it off sets `is_shared = false`.
- AC-8.1.3: Only quizzes with `is_shared = true` appear on student dashboards for that class. A quiz with `is_shared = false` is absent from all student views.
- AC-8.1.4: The share toggle reflects the current `is_shared` state when the page loads.

---

## Feature Group 9 — Notes Generation (Student)

### Story 9.1 — Generate study notes from uploaded material

**Status: Verified**

**As a** student,
**I want** to generate structured study notes on a topic from a document I have uploaded,
**so that** I have a concise summary to review.

**Acceptance Criteria:**
- AC-9.1.1: The notes generation request (`POST /notes/generate`) requires a non-empty `topic`. The UI blocks submission when the topic field is empty.
- AC-9.1.2: When `file_id` is provided, the system retrieves the top 15 most relevant chunks via hybrid search and passes them as context to GPT-4o.
- AC-9.1.3: The response contains a structured notes object with the following fields: `summary` (string), `key_concepts` (array of `{term, definition, example}`), `important_details` (array of strings), and `common_misconceptions` (array of strings).
- AC-9.1.4: When no `file_id` is provided, `outside_sources` defaults to `true` and the system generates notes from GPT-4o's general knowledge.

---

### Story 9.2 — Save generated notes

**Status: Verified**

**As a** student,
**I want** to save a set of notes I have generated,
**so that** I can access them later from my dashboard.

**Acceptance Criteria:**
- AC-9.2.1: After notes are generated, a Save button is available. Clicking it stores the notes (tied to the current user and optionally to a `file_id`).
- AC-9.2.2: The Save button shows a confirmation indicator after successful save and is not clickable again for the same notes.
- AC-9.2.3: Saved notes are accessible from the student dashboard.

---

## Feature Group 10 — Instructor Notes System

### Story 10.1 — Create class notes

**Status: Verified**

**As an** instructor,
**I want** to create structured notes for a class topic,
**so that** I can share curated study material with my students.

**Acceptance Criteria:**
- AC-10.1.1: From the class detail page, the instructor can create a note by entering a `title` and `topic`. The `file_id` is optional.
- AC-10.1.2: Submitting the form triggers `POST /notes/generate` with the provided `topic` and `file_id`. The response is stored in `class_notes` with `class_id`, `created_by`, `title`, `topic`, `content` (the generated notes object), and `is_published = false`.
- AC-10.1.3: Newly created notes appear in the class detail page's notes list immediately.

---

### Story 10.2 — Edit class notes

**Status: Verified**

**As an** instructor,
**I want** to edit the content of notes I have created for a class,
**so that** I can correct or expand on the AI-generated content before sharing it.

**Acceptance Criteria:**
- AC-10.2.1: Each note in the class detail view has an Edit button. Clicking it opens an inline editor in place of the note's read view.
- AC-10.2.2: The editor allows modification of `title`, `summary`, each entry in `key_concepts` (term, definition, example), each item in `important_details`, and each item in `common_misconceptions`.
- AC-10.2.3: The instructor can add or remove individual `key_concepts`, `important_details`, and `common_misconceptions` items.
- AC-10.2.4: Clicking Save updates the `class_notes` row with the new `title` and `content`. Clicking Cancel discards all changes and returns to the read view.

---

### Story 10.3 — Publish and unpublish class notes

**Status: Verified**

**As an** instructor,
**I want** to control whether students can see a set of class notes,
**so that** I can prepare materials before making them available.

**Acceptance Criteria:**
- AC-10.3.1: Each note has a Publish/Unpublish toggle. Activating it sets `is_published = true` in `class_notes`; deactivating sets `is_published = false`.
- AC-10.3.2: Notes with `is_published = false` do not appear on any student dashboard or class note view.
- AC-10.3.3: Notes with `is_published = true` appear on the student dashboard under the student's joined class and are accessible via `/class-note/:id`.
- AC-10.3.4: The toggle reflects the current `is_published` state on page load.

---

## Feature Group 11 — Flashcard Study

### Story 11.1 — Study a flashcard set

**Status: Verified**

**As a** student,
**I want** to flip through a set of flashcards and rate my confidence on each one,
**so that** I can identify which concepts I know and which need more practice.

**Acceptance Criteria:**
- AC-11.1.1: The flashcard study page (`/flashcards/:id`) loads the flashcard set from `flashcard_sets` by ID. If the ID does not exist, the page displays an appropriate message.
- AC-11.1.2: Cards are displayed one at a time. The front face is shown by default; clicking the card reveals the back face.
- AC-11.1.3: After revealing the back, the student rates each card with one of three options: Know (correct), Almost (partial), or Nope (incorrect). Rating a card advances to the next card.
- AC-11.1.4: After the last card is rated, a results summary is displayed showing the count of Know, Almost, and Nope ratings.

---

### Story 11.2 — Restart a flashcard session

**Status: Verified**

**As a** student,
**I want** to restart a flashcard session — either with all cards or only the ones I got wrong —
**so that** I can efficiently focus my remaining study time.

**Acceptance Criteria:**
- AC-11.2.1: The results summary provides two restart options: Restart All (resets to the full original card set) and Retry Missed (resets to only cards rated Nope).
- AC-11.2.2: If no cards were rated Nope, Retry Missed restarts with the full card set.
- AC-11.2.3: Restarting resets the card index to 0, clears all ratings, and returns to the front-face view of the first card.

---

### Story 11.3 — Edit a flashcard set

**Status: Verified**

**As a** student,
**I want** to edit the cards in a flashcard set,
**so that** I can correct errors or add my own notes to the AI-generated content.

**Acceptance Criteria:**
- AC-11.3.1: The flashcard study page provides a link to `/flashcards/:id/edit`.
- AC-11.3.2: The flashcard editor (`FlashcardEditor`) displays each card's `front` and `back` fields as editable inputs.
- AC-11.3.3: The editor allows adding new cards and deleting existing cards.
- AC-11.3.4: Saving updates the `cards` jsonb array in `flashcard_sets` for the corresponding set ID.

---

## Feature Group 12 — Theme Preferences

### Story 12.1 — Toggle dark mode

**As a** user (instructor or student),
**I want** to switch the app between light and dark colour themes,
**so that** I can reduce eye strain in low-light environments and match my system preferences.

**Acceptance Criteria:**
- AC-12.1.1: A theme toggle control is rendered in the top navigation bar on every authenticated page. The control displays the icon of the theme that will be activated on click (moon icon in light mode, sun icon in dark mode).
- AC-12.1.2: Clicking the toggle switches the active theme between `light` and `dark` by applying/removing the `dark` class on the root `<html>` element. The visual change occurs within 100ms without a page reload.
- AC-12.1.3: The selected theme is persisted to `localStorage` under the key `aq_theme` with the value `"light"` or `"dark"`. The value is written synchronously on every toggle.
- AC-12.1.4: On initial page load, the app reads `aq_theme` from `localStorage` and applies the stored theme before the first paint. If no value is stored, the app falls back to the OS preference via the `prefers-color-scheme: dark` media query.
- AC-12.1.5: When `aq_theme` is absent and the OS `prefers-color-scheme` changes while the app is open, the app updates the theme live to match the OS preference. Once the user has explicitly toggled the theme, subsequent OS preference changes are ignored.
- AC-12.1.6: In dark mode, every page (login, registration, instructor dashboard, student dashboard, class detail, quiz study, flashcard study, notes view, upload, and generation pages) renders with dark backgrounds and light-on-dark text. No element renders as black text on a black background or white text on a white background.
- AC-12.1.7: Text in dark mode meets WCAG 2.1 AA contrast requirements: body text has a contrast ratio of at least 4.5:1 against its background, and large text (≥18pt or ≥14pt bold) has a contrast ratio of at least 3:1.
- AC-12.1.8: The theme preference is applied consistently across browser tabs of the same origin — toggling dark mode in one tab updates other open tabs within 1 second via the `storage` event listener.

---

## Feature Group 13 — User Profile (Avatar & Display Name)

### Story 13.1 — View and edit profile

**As a** student or instructor,
**I want** to open a profile page that shows my current account details and lets me change my display name and avatar,
**so that** my identity in the app reflects how I want to be seen.

**Acceptance Criteria:**
- AC-13.1.1: The profile page (`/profile`) is reachable only by authenticated users. Both `student` and `instructor` roles are permitted (`<ProtectedRoute allowedRole={["student", "instructor"]}>`).
- AC-13.1.2: The page renders a preview block showing the currently selected avatar image, the current `full_name`, the user's `email`, and the user's `role` (capitalised).
- AC-13.1.3: The display-name input is pre-filled with the user's existing `full_name`. It is `required`, `minLength=1`, `maxLength=80`. The Save button is disabled while the trimmed value is empty.
- AC-13.1.4: The avatar picker renders a fixed list of preset DiceBear avatars (URLs of the form `https://api.dicebear.com/7.x/avataaars/svg?seed=<seed>`). Clicking a preset updates the preview block immediately without writing to Supabase. The currently selected preset has a visible selected state (ring/border).

---

### Story 13.2 — Save profile changes

**As a** student or instructor,
**I want** to save my chosen avatar and display name,
**so that** the changes persist across sessions and devices.

**Acceptance Criteria:**
- AC-13.2.1: Submitting the form calls `supabase.from("profiles").update({ full_name, avatar_url }).eq("id", user.id)`. No other rows in `profiles` may be updated by the request.
- AC-13.2.2: Both `full_name` (trimmed) and `avatar_url` are written in the same update. `email`, `role`, `created_at`, and `id` must not be modified by this feature.
- AC-13.2.3: While saving, the Save button shows a loading state and is disabled. On success, a confirmation message is shown and the page is reloaded so the cached `profile` in `AuthContext` is refreshed. On failure, the error message returned by Supabase is displayed inline; the form remains editable.
- AC-13.2.4: A user must not be able to update another user's profile row. Supabase RLS on `profiles` must enforce `auth.uid() = id` for `UPDATE`.

---

### Story 13.3 — Avatar surfaces in the navbar

**As a** student or instructor,
**I want** to see my avatar in the navbar and click it to reach the profile page,
**so that** my profile is one click away from anywhere in the app.

**Acceptance Criteria:**
- AC-13.3.1: The right side of the navbar renders the user's `avatar_url` as a small round image. When `avatar_url` is `null`/missing, a fallback `User` lucide icon inside a neutral circle is shown instead.
- AC-13.3.2: The avatar/name region is wrapped in a `<Link to="/profile">` and clicking it navigates to the profile page. The Logout button is unaffected and still works.
- AC-13.3.3: After a successful save, the navbar reflects the updated `avatar_url` and `full_name` (achieved by reloading the page in this implementation — see §4c).
