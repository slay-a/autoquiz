# AutoQuiz

AI-powered study platform — upload course material, generate quizzes and study notes, share with students.

## Features

**Instructors**
- Create classes with invite codes
- Upload course material (PDF, DOCX, PPTX) per class
- Generate quizzes grounded in uploaded material (GPT-4o + RAG)
- Share / unshare quizzes with students on demand
- Generate structured study notes per topic/chapter
- Edit notes (summary, key concepts, details, misconceptions, tips)
- Publish / unpublish notes to students
- Remove students, delete classes

**Students**
- Join classes via invite code
- View and study quizzes shared by instructors
- Read published class notes
- Generate personal quizzes from any topic
- Build flashcard sets from quiz results, edit and study them
- Upload personal files and generate personal study notes from them

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              React + Vite + Tailwind CSS                │
│   Auth · Instructor Dashboard · Student Dashboard       │
│   ClassView · QuizStudy · FlashcardStudy · Notes       │
└────────────────────────┬────────────────────────────────┘
                         │ REST  (VITE_API_URL / Vite proxy)
┌────────────────────────▼────────────────────────────────┐
│                    FastAPI Backend                       │
│   /upload  /retrieve  /quiz/generate  /notes/generate   │
│                                                          │
│   Celery + Redis  — async file processing jobs          │
└──────┬──────────────────────────┬───────────────────────┘
       │                          │
┌──────▼──────┐        ┌──────────▼────────────────────┐
│  LlamaIndex │        │           Supabase             │
│  Parse      │        │  PostgreSQL   pgvector         │
│  Chunk      │───────▶│  Auth (JWT + RLS)              │
│  Embed      │        │  Storage (uploads bucket)      │
│  Retrieve   │        │  Realtime (job status)         │
└──────┬──────┘        └───────────────────────────────┘
       │
┌──────▼──────┐
│  OpenAI API │
│  GPT-4o     │  quiz generation · notes generation
│  Embeddings │  text-embedding-3-small
└─────────────┘
```

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + React Router v6 |
| Backend | FastAPI (Python 3.11+) |
| Auth | Supabase Auth (JWT, role-based: instructor / student) |
| Database | Supabase PostgreSQL + pgvector |
| File Storage | Supabase Storage (private `uploads` bucket) |
| Async Jobs | Celery + Redis |
| RAG Pipeline | LlamaIndex (parse → chunk → embed → hybrid search) |
| LLM | OpenAI GPT-4o (quiz + notes generation) |
| Embeddings | OpenAI text-embedding-3-small |

## Project Structure

```
autoquiz/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── dependencies.py  # auth + role guards
│   │   │   └── routes/
│   │   │       ├── upload.py    # file upload + Celery job dispatch
│   │   │       ├── retrieve.py  # hybrid search (keyword + vector)
│   │   │       ├── quiz.py      # quiz generation (GPT-4o)
│   │   │       ├── notes.py     # study notes generation (GPT-4o)
│   │   │       └── classes.py   # class + membership management
│   │   ├── core/
│   │   │   ├── config.py        # env / settings
│   │   │   └── supabase.py      # Supabase client singleton
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── ingestion.py     # parse → clean → chunk → embed
│   │   │   ├── retrieval.py     # hybrid_search()
│   │   │   ├── quiz_gen.py      # prompt building + JSON parsing
│   │   │   ├── notes_gen.py     # notes prompt building + parsing
│   │   │   ├── class_service.py # class business logic
│   │   │   └── upload.py        # upload orchestration
│   │   └── utils/
│   │       └── parsers.py       # PDF / DOCX / PPTX extractors
│   ├── tests/                   # pytest backend test suite
│   ├── celery_worker.py         # async ingest job
│   ├── main.py                  # FastAPI app + CORS
│   ├── supabase_schema.sql      # full DB schema (run once in Supabase)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx  # Supabase auth + profile caching
│   │   ├── components/
│   │   │   ├── Upload.jsx        # file upload + job status polling
│   │   │   ├── TopicSearch.jsx   # quiz config form
│   │   │   ├── QuizView.jsx      # quiz display + scoring
│   │   │   └── ProtectedRoute.jsx
│   │   ├── lib/
│   │   │   ├── supabase.js       # Supabase JS client
│   │   │   └── sharing.js        # share link helpers
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Notes.jsx         # student personal notes
│   │   │   ├── QuizStudy.jsx     # quiz study session
│   │   │   ├── StudentQuiz.jsx   # student-facing shared quiz view
│   │   │   ├── FlashcardStudy.jsx
│   │   │   ├── FlashcardEditor.jsx
│   │   │   ├── ClassNoteView.jsx # read-only class note viewer
│   │   │   ├── instructor/
│   │   │   │   ├── Dashboard.jsx # class list + create class
│   │   │   │   └── ClassView.jsx # quizzes, notes, files, members
│   │   │   └── student/
│   │   │       ├── Dashboard.jsx # quizzes, class quizzes, notes, flashcards
│   │   │       └── Generate.jsx  # personal quiz generator
│   │   ├── __tests__/           # Vitest frontend test suite
│   │   ├── App.jsx               # routing + navbar
│   │   └── index.css
│   ├── vite.config.js
│   └── tailwind.config.js
└── docker-compose.yml           # Redis
```

## Local Setup

### Prerequisites
- Python 3.11+
- Node 18+
- Docker (for Redis)
- Supabase project
- OpenAI API key

### 1 — Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # fill in your keys
uvicorn main:app --reload
```

### 2 — Celery worker (separate terminal)

```bash
cd backend
source venv/bin/activate
celery -A celery_worker worker --loglevel=info
```

### 3 — Redis

```bash
docker-compose up -d redis
```

### 4 — Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`.

## Running Tests

```bash
# Backend (pytest, 270+ tests)
cd backend
source venv/bin/activate
python -m pytest -q

# Frontend (vitest, 290+ tests)
cd frontend
npm test
```

Both suites are also runnable individually per feature:

```bash
python -m pytest backend/tests/test_feat_006_quiz_generation.py -v
npx vitest run src/__tests__/QuizStudy.test.jsx
```

## Environment Variables

Copy the example files and fill in your keys:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Reference — `backend/.env`:

```env
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
REDIS_URL=redis://localhost:6379/0
MAX_UPLOAD_SIZE_MB=50
CHUNK_SIZE_TOKENS=400
CHUNK_OVERLAP_TOKENS=60
TOP_K_RESULTS=10
```

Create `frontend/.env.local`:

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:8000
```

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Enable the `vector` extension: **Database → Extensions → vector**
3. Create a private Storage bucket named **`uploads`**
4. Run `backend/supabase_schema.sql` in **SQL Editor**

The schema creates: `profiles`, `classes`, `class_members`, `uploaded_files`, `processing_jobs`, `chunks`, `saved_quizzes`, `flashcard_sets`, `class_notes` — with RLS and triggers.

## Database Tables

| Table | Purpose |
|---|---|
| `profiles` | User accounts with `role` (instructor / student) |
| `classes` | Instructor-owned classes with invite codes |
| `class_members` | Student ↔ class join table |
| `uploaded_files` | File metadata per class |
| `processing_jobs` | Celery job status (queued → done / error) |
| `chunks` | Text chunks + pgvector embeddings |
| `saved_quizzes` | Generated quizzes; `is_shared` controls student visibility |
| `flashcard_sets` | Flashcard sets created from quiz results; `is_shared`/`is_public` control sharing |
| `class_notes` | Instructor-generated study notes; `is_published` controls student visibility |
| `student_notes` | Student-generated personal study notes tied to uploaded files |

## Team & Contributions

AutoQuiz was built collaboratively under a TDD multi-agent workflow
(Test Creation, Code Developer, Architecture Review, DevOps). Each
contribution below maps to commits authored under the listed GitHub
identity.

| Contributor | GitHub | Primary modules / scope |
|---|---|---|
| Srilaya Ponangi (Laya) | [@slay-a](https://github.com/slay-a) | Project scaffold and initial full-stack skeleton; `docs/DESIGN.md` authoring and revisions (architecture, error handling, event catalog, schema); multi-agent pipeline + `.claude/agents/*` setup; FEAT-001 auth pipeline run; `TopBar` profile entry point and light-mode UI fixes; backend config hardening (Pydantic v2); repo hygiene (`.gitignore`, env examples, router future flags). |
| Justin Reyes | [@justinreyes145](https://github.com/justinreyes145) | FEAT-004 LlamaIndex ingestion (parse → clean → chunk → embed); FEAT-005 file upload + storage; FEAT-006 quiz generation (GPT-4o + RAG); FEAT-007 quiz study & saving (with Shima); FEAT-008 quiz sharing; FEAT-009 student notes; FEAT-010 instructor notes (with Shima); FEAT-011 flashcard study; FEAT-013 user-story drafting; test-suite stabilisation. |
| Shima (Shabnam) Jabbari | [@ShimaJabbari](https://github.com/ShimaJabbari) / [@Shabnamjabbari](https://github.com/Shabnamjabbari) | FEAT-002 class management (instructor); FEAT-003 class membership (student); FEAT-012 dark mode + theme preferences; FEAT-013 user profile (avatar, RLS); FEAT-014 event-catalog completeness; layer-boundary enforcement (FastAPI route migration); JWT signature verification (issue-037); error-envelope standardisation (issue-022). |

Per-feature acceptance criteria and verification status live in
[`specs/IMPLEMENTED_USER_STORIES.md`](specs/IMPLEMENTED_USER_STORIES.md).
The architectural source of truth is [`docs/DESIGN.md`](docs/DESIGN.md);
the test-case index is [`docs/TESTCASES.md`](docs/TESTCASES.md).

## Course Submission Checklist

| Deliverable | Where it goes | Source in this repo |
|---|---|---|
| Final presentation (PPTX) — purpose, what the app does, repo URL, individual contributions, embedded demo video | Canvas | — (built from the *Team & Contributions* section above) |
| Architectural document | Google Sheets (linked in the assignment) | [`docs/DESIGN.md`](docs/DESIGN.md) |
| GitHub repository URL | PPTX cover slide + Google Sheets row | This repository |
| User stories + acceptance criteria | Reviewed in GitHub | [`specs/IMPLEMENTED_USER_STORIES.md`](specs/IMPLEMENTED_USER_STORIES.md) |
| Test case sheet | Reviewed in GitHub | [`docs/TESTCASES.md`](docs/TESTCASES.md) |
| Backend tests | Reviewed in GitHub (CI gated) | [`backend/tests/`](backend/tests/) — `pytest -q` |
| Frontend tests | Reviewed in GitHub (CI gated) | [`frontend/src/__tests__/`](frontend/src/__tests__) — `npm test` |
| Multi-agent TDD pipeline config | Reviewed in GitHub | [`.claude/agents/`](.claude/agents) |

> Each commit is authored under the contributor's own GitHub identity so
> per-student contributions can be filtered with
> `git log --author="<name>"` or `git shortlog -sne --all`.
