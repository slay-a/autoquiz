# Feature Brief: File Upload & Processing Pipeline

---

## 1. Summary

**Feature:** File upload and processing pipeline — users upload PDF, DOCX, or PPTX documents; the system stores them in Supabase Storage, kicks off a background processing job, and exposes a status-polling endpoint so the client knows when the file is ready for quiz and notes generation. Previously processed files can be re-selected for generation without re-uploading.
**Requested by:** Instructor / Student
**Priority:** High

Stories 5.1 and 5.2 are already implemented and have passed the pipeline. Stories 5.3 and 5.4 are additive: 5.3 documents existing instructor behaviour that was previously unspecified; 5.4 is new student-facing functionality to be built.

---

## 2. User Stories

### Story 5.1 — Upload a document

**As a** user (instructor or student),
**I want** to upload a course document (PDF, DOCX, or PPTX),
**so that** the system can generate quizzes and notes grounded in its content.

**Acceptance Criteria:**
- [x] AC-5.1.1: The upload component accepts only files with extensions `.pdf`, `.docx`, or `.pptx`. Files with any other extension are rejected before upload with an error message.
- [x] AC-5.1.2: Files larger than 50MB are rejected with HTTP 413. The UI displays an error message.
- [x] AC-5.1.3: On successful upload, the file is stored in Supabase Storage under the path `{file_id}/{filename}` in the `uploads` bucket.
- [x] AC-5.1.4: A row is inserted into `uploaded_files` with `file_id`, `filename`, and `uploaded_by` set to the current user's ID.
- [x] AC-5.1.5: A row is inserted into `processing_jobs` with `status = 'queued'` and `stage = 'upload'`. The `job_id` is returned to the client.

---

### Story 5.2 — Track processing status

**As a** user,
**I want** to see the processing status of my uploaded document,
**so that** I know when it is ready to use for quiz generation.

**Acceptance Criteria:**
- [x] AC-5.2.1: The client can poll `GET /upload/status/{job_id}` to retrieve the current job status.
- [x] AC-5.2.2: The `status` field progresses through: `queued` → `in_progress` → `success` or `failed`.
- [x] AC-5.2.3: The `stage` field reflects the current pipeline step: `upload`, `extract`, `clean`, `section`, or `chunk`.
- [x] AC-5.2.4: If processing fails, `status = 'failed'` and `error_message` contains a human-readable description. `error_code` contains a machine-readable code.
- [x] AC-5.2.5: The `updated_at` timestamp is automatically refreshed on every status change via the `jobs_updated_at` database trigger.

---

### Story 5.3 — Re-access previously uploaded files for generation (Instructor)

**As an** instructor,
**I want** to select a file I have already uploaded to a class without re-uploading it,
**so that** I can generate quizzes and notes from the same document multiple times without redundant uploads.

> **Pipeline note:** This behaviour is already implemented. It was absent from the original user stories and is documented here retroactively. Req-validator should verify ACs against existing code; prototyper should not touch this story unless a gap is found.

**Acceptance Criteria:**
- [x] AC-5.3.1: The class detail page displays a list of files previously uploaded to that class where the corresponding `processing_jobs` row has `status = 'success'`.
- [x] AC-5.3.2: Each file entry displays the `filename` and `created_at` timestamp from `uploaded_files`.
- [x] AC-5.3.3: The instructor can select a file from this list to use as the `file_id` source for quiz or notes generation — no re-upload is required.
- [x] AC-5.3.4: The file list is scoped to the class context — only files associated with that class are shown, not files from other classes.

---

### Story 5.4 — Re-access previously uploaded files for generation (Student)

**As a** student,
**I want** to select a file I have already uploaded without re-uploading it,
**so that** I can generate quizzes and notes from the same document multiple times without redundant uploads.

> **Pipeline note:** This behaviour does not yet exist for students. Instructors have an equivalent feature (Story 5.3). The prototyper should implement this story; validators should treat all ACs as new functionality.

**Acceptance Criteria:**
- [x] AC-5.4.1: The student generate page displays a list of files the student has previously uploaded where the corresponding `processing_jobs` row has `status = 'success'`.
- [x] AC-5.4.2: Each file entry displays the `filename` and `created_at` timestamp from `uploaded_files`.
- [x] AC-5.4.3: The student can select a file from this list to use as the `file_id` source for quiz or notes generation — no re-upload is required.
- [x] AC-5.4.4: The file list is scoped to the current student — only files where `uploaded_by` matches the authenticated user's ID are shown.
- [x] AC-5.4.5: The file picker and the upload component coexist on the same page. Selecting an existing file dismisses/disables the upload input, and vice versa.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Instructor | Upload files; poll status for own jobs; re-select class-scoped processed files for generation | Access other users' jobs or files; see files outside the current class context | FastAPI `get_current_user` + Supabase RLS on `uploaded_files` and `processing_jobs` (uploaded_by = auth.uid()); class-scoping enforced at query level |
| Student | Upload files; poll status for own jobs; re-select own processed files for generation (Story 5.4) | Access other users' jobs or files | FastAPI `get_current_user` + Supabase RLS (uploaded_by = auth.uid()) |
| Unauthenticated | None | All actions | FastAPI auth dependency |

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes
- **Tables:**
  - `uploaded_files`: `file_id` (uuid PK), `filename` (text), `uploaded_by` (uuid FK → auth.users), `created_at`
  - `processing_jobs`: `job_id` (uuid PK), `file_id` (FK → uploaded_files), `status` (text), `stage` (text), `error_message` (text nullable), `error_code` (text nullable), `created_at`, `updated_at`
- **Storage:** Supabase Storage bucket `uploads`, path `{file_id}/{filename}`
- **DB trigger:** `jobs_updated_at` trigger automatically sets `updated_at` on every `processing_jobs` row update
- **Migration required:** No (already in place)

### 4b. Backend architecture

- **Routes:** `backend/app/api/routes/upload.py` — `POST /upload`, `GET /upload/status/{job_id}`
- **New route (Story 5.4):** `GET /upload/files` — returns the authenticated user's successfully processed files (`status = 'success'`), joining `uploaded_files` to `processing_jobs`; `uploaded_by` filter applied from JWT
- **Class-scoped file list (Story 5.3):** file list for instructors is filtered by class context at the query level — exact mechanism (join table, `class_id` column on `uploaded_files`, or existing class-scoping) to be verified by design-validator
- **Background processing:** Celery worker task triggered after successful upload; progresses `processing_jobs` through stage transitions
- **File size enforcement:** FastAPI middleware or route-level check rejects files > 50MB with HTTP 413
- **Async / sync?** Upload and file-list routes are synchronous; processing is a Celery background task
- **LLM involvement?** No

### 4c. Frontend architecture

- **Pages affected:**
  - Upload component (shared, used from instructor class detail and student generate pages)
  - Status polling UI — client polls `GET /upload/status/{job_id}` on an interval until `status` is `success` or `failed`
  - `frontend/src/pages/instructor/ClassView.jsx` — existing processed-file list (Story 5.3, already implemented)
  - `frontend/src/pages/student/Generate.jsx` — new processed-file picker coexisting with upload input (Story 5.4, to be built)
- **State scope:** local component state (upload progress, job status, selected file); no new context
- **Mutual exclusion (Story 5.4):** selecting an existing file from the picker sets `file_id` and disables/hides the upload input; clearing the selection re-enables upload
- **No secrets in client-side code:** confirmed

### 4d. RAG pipeline impact

- **Affects chunking?** This feature initiates the pipeline that leads to chunking (via FEAT-004 LlamaIndex ingestion), but does not implement chunking itself.
- **Affects embedding?** No — embedding is downstream in the Celery worker.
- **Affects retrieval query?** No.
- **Affects LLM prompt?** No.

### 4e. Security considerations

- **User-controlled data injected into LLM prompts?** No.
- **New SQL queries?** Yes — parameterized queries only; `uploaded_by` is always set from the JWT, never from the client payload.
- **File path construction:** `file_id` is a server-generated UUID — never derived from user-supplied filename.
- **CORS / auth headers affected?** No.

---

## 5. Out of Scope

- File deletion or replacement after upload
- Re-processing a previously uploaded file
- Support for file types beyond `.pdf`, `.docx`, `.pptx`
- Real-time status updates via WebSocket or Server-Sent Events (polling only)
- File preview or download by the user
- Showing failed or in-progress files in the re-access file picker (only `status = 'success'` files are listed)
- Pagination of the processed-file list (all successful files for the user/class are returned in one response in this iteration)
- Cross-student file sharing — a student's processed files are never visible to other students or instructors

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Is the 50MB limit enforced in the FastAPI route, Supabase Storage policy, or both? | pipeline | Req-validator should check the upload route and Supabase bucket config for AC-5.1.2 |
| 2 | Does the status polling UI use a fixed interval or exponential backoff? | pipeline | Design-validator should check the frontend polling implementation |
| 3 | How is the instructor file list currently scoped to a class (Story 5.3)? Is there a `class_id` on `uploaded_files`, a join table, or another mechanism? | pipeline | Design-validator must identify the existing scoping mechanism before prototyper mirrors it for Story 5.4 |
| 4 | Should the student file picker (Story 5.4) be a new backend route (`GET /upload/files`) or a Supabase client-side query? | pipeline | Design-validator should match the pattern used by the instructor's existing file list |

---

## 7. Test Boundaries

- **External deps to mock:** `supabase.storage.from_('uploads').upload()`, `supabase.from('uploaded_files')`, `supabase.from('processing_jobs')`, Celery task dispatch
- **Fixtures needed:** small valid `.pdf`, `.docx`, `.pptx` files; an oversized file stub; a file with an unsupported extension; `uploaded_files` + `processing_jobs` rows at `status = 'success'` and `status = 'failed'` for picker tests
- **Integration vs. unit boundary:**
  - Upload route handler = integration test with mocked Supabase storage and DB
  - Status polling route = integration test with mocked `processing_jobs` row at each stage
  - File type and size validation = unit tests against the route's validation logic
  - `jobs_updated_at` trigger = DB-level test (can be skipped if live DB not available)
  - File list route / query (Stories 5.3 & 5.4) = integration test verifying only `status = 'success'` rows are returned and scoping is correct (class for instructor, `uploaded_by` for student)
- **Frontend test targets (Stories 5.1–5.2, already tested):** upload component rejects unsupported extensions; displays error on 413; renders correct status label per `status`/`stage`
- **Frontend test targets (Stories 5.3–5.4, new):** instructor class view shows only successfully processed files scoped to that class; student generate page renders file picker; selecting a file sets `file_id` and disables upload input; clearing selection re-enables upload input; failed/in-progress files are absent from the picker
- **Explicitly out of test scope:** live Supabase Storage writes, live Celery worker execution, live DB trigger

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-005-file-upload.md`
