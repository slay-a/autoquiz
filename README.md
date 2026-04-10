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
- Upload personal notes/files

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
│   │   ├── api/routes/
│   │   │   ├── upload.py        # file upload + Celery job dispatch
│   │   │   ├── retrieve.py      # hybrid search (keyword + vector)
│   │   │   ├── quiz.py          # quiz generation (GPT-4o)
│   │   │   └── notes.py         # study notes generation (GPT-4o)
│   │   ├── core/
│   │   │   ├── config.py        # env / settings
│   │   │   └── supabase.py      # Supabase client singleton
│   │   ├── services/
│   │   │   ├── ingestion.py     # parse → clean → chunk → embed
│   │   │   ├── retrieval.py     # hybrid_search()
│   │   │   └── quiz_gen.py      # prompt building + JSON parsing
│   │   └── utils/
│   │       └── parsers.py       # PDF / DOCX / PPTX extractors
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
│   │   │   ├── FlashcardStudy.jsx
│   │   │   ├── FlashcardEditor.jsx
│   │   │   ├── ClassNoteView.jsx # read-only class note viewer
│   │   │   ├── instructor/
│   │   │   │   ├── Dashboard.jsx # class list + create class
│   │   │   │   └── ClassView.jsx # quizzes, notes, files, members
│   │   │   └── student/
│   │   │       ├── Dashboard.jsx # quizzes, class quizzes, notes, flashcards
│   │   │       └── Generate.jsx  # personal quiz generator
│   │   ├── App.jsx               # routing + navbar
│   │   └── index.css
│   ├── vite.config.js
│   └── tailwind.config.js
└── docker-compose.yml            # Redis
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

## Environment Variables

Create `backend/.env`:

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
| `flashcard_sets` | Flashcard sets created from quiz results |
| `class_notes` | Instructor-generated study notes; `is_published` controls student visibility |
