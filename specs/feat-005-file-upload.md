# Feature Brief: File Upload & Processing Pipeline

---

## 1. Summary

**Feature:** File upload and processing pipeline — users upload PDF, DOCX, or PPTX documents; the system stores them in Supabase Storage, kicks off a background processing job, and exposes a status-polling endpoint so the client knows when the file is ready for quiz and notes generation.
**Requested by:** Instructor / Student
**Priority:** High

This feature is already implemented. This spec exists to onboard the feature into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

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

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Instructor | Upload files; poll status for own jobs | Access other users' jobs or files | FastAPI `get_current_user` + Supabase RLS on `uploaded_files` and `processing_jobs` (uploaded_by = auth.uid()) |
| Student | Upload files; poll status for own jobs | Access other users' jobs or files | FastAPI `get_current_user` + Supabase RLS |
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
- **Background processing:** Celery worker task triggered after successful upload; progresses `processing_jobs` through stage transitions
- **File size enforcement:** FastAPI middleware or route-level check rejects files > 50MB with HTTP 413
- **Async / sync?** Upload route is synchronous; processing is a Celery background task
- **LLM involvement?** No

### 4c. Frontend architecture

- **Pages affected:**
  - Upload component (shared, used from instructor class detail and student generate pages)
  - Status polling UI — client polls `GET /upload/status/{job_id}` on an interval until `status` is `success` or `failed`
- **State scope:** local component state (upload progress, job status)
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
- Per-class file scoping (files are user-scoped, not class-scoped, in this iteration)

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Is the 50MB limit enforced in the FastAPI route, Supabase Storage policy, or both? | pipeline | Req-validator should check the upload route and Supabase bucket config for AC-5.1.2 |
| 2 | Does the status polling UI use a fixed interval or exponential backoff? | pipeline | Design-validator should check the frontend polling implementation |

---

## 7. Test Boundaries

- **External deps to mock:** `supabase.storage.from_('uploads').upload()`, `supabase.from('uploaded_files')`, `supabase.from('processing_jobs')`, Celery task dispatch
- **Fixtures needed:** small valid `.pdf`, `.docx`, `.pptx` files; an oversized file stub; a file with an unsupported extension
- **Integration vs. unit boundary:**
  - Upload route handler = integration test with mocked Supabase storage and DB
  - Status polling route = integration test with mocked `processing_jobs` row at each stage
  - File type and size validation = unit tests against the route's validation logic
  - `jobs_updated_at` trigger = DB-level test (can be skipped if live DB not available)
- **Frontend test targets:** upload component rejects unsupported extensions before submission; displays error on 413 response; renders correct status label for each `status`/`stage` combination
- **Explicitly out of test scope:** live Supabase Storage writes, live Celery worker execution, live DB trigger

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-005-file-upload.md`
