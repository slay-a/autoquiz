# AutoQuiz

AI-powered quiz generation from uploaded learning materials (PDF, DOCX, PPTX).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Frontend                         │
│              React + Vite + Tailwind + shadcn/ui        │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────┐
│                    FastAPI Backend                       │
│   /upload   →   /retrieve   →   /quiz                   │
│        │                                                 │
│   Celery + Redis  (async file processing jobs)          │
└──────┬──────────────────────────┬───────────────────────┘
       │                          │
┌──────▼──────┐        ┌──────────▼────────────────────┐
│  LlamaIndex │        │           Supabase             │
│  - Parse    │        │  ┌─────────────────────────┐  │
│  - Chunk    │───────▶│  │  PostgreSQL (metadata)  │  │
│  - Embed    │        │  │  pgvector (embeddings)  │  │
│  - Retrieve │        │  │  Auth (roles/RLS)       │  │
└──────┬──────┘        │  │  Storage (file uploads) │  │
       │               │  │  Realtime (job status)  │  │
┌──────▼──────┐        │  └─────────────────────────┘  │
│  OpenAI API │        └───────────────────────────────┘
│  - Embeds   │
│  - GPT-4o   │
│  (Quiz gen) │
└─────────────┘
```

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| API | FastAPI | Best async Python framework for AI/ML |
| Parsing | PyMuPDF + python-docx + python-pptx | Best-in-class per format |
| RAG Pipeline | LlamaIndex | Purpose-built for ingest→chunk→embed→retrieve |
| Embeddings | OpenAI text-embedding-3-small | Best quality/cost ratio |
| Vector Store | Supabase pgvector | No extra service — built into Supabase Postgres |
| DB + Auth + Storage | Supabase | Postgres + Auth + Storage + Realtime in one |
| Async Jobs | Celery + Redis | Reliable retry/status tracking for large file processing |
| LLM | OpenAI GPT-4o | Quiz generation with structured JSON output |
| Frontend | React + Vite + Tailwind + shadcn/ui | Fast DX, accessible component library |

## Project Structure

```
autoquiz/
├── backend/
│   ├── app/
│   │   ├── api/routes/
│   │   │   ├── upload.py       # E1: file upload & processing
│   │   │   ├── retrieve.py     # E2: topic/keyword search
│   │   │   └── quiz.py         # E3: quiz generation
│   │   ├── core/
│   │   │   ├── config.py       # env vars / settings
│   │   │   └── supabase.py     # supabase client singleton
│   │   ├── models/
│   │   │   └── schemas.py      # pydantic request/response models
│   │   ├── services/
│   │   │   ├── ingestion.py    # parse → clean → chunk → embed
│   │   │   ├── retrieval.py    # hybrid search (keyword + vector)
│   │   │   └── quiz_gen.py     # GPT-4o quiz generation
│   │   └── utils/
│   │       └── parsers.py      # PDF / DOCX / PPTX extractors
│   ├── celery_worker.py        # async job definitions
│   ├── main.py                 # FastAPI app entrypoint
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui components (add via CLI)
│   │   │   ├── Upload.jsx      # file upload + job status
│   │   │   ├── TopicSearch.jsx # search interface
│   │   │   └── QuizView.jsx    # quiz display + answers
│   │   ├── pages/
│   │   │   ├── InstructorDashboard.jsx
│   │   │   └── StudentQuiz.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── tasks/                      # teammate task breakdowns
├── docker-compose.yml          # Redis for Celery
└── .gitignore
```

## Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Enable the `pgvector` extension: **Database → Extensions → vector**
3. Run the SQL in `backend/supabase_schema.sql`
4. Copy your project URL and anon/service keys to `.env`

## Local Setup

### Prerequisites
- Python 3.11+
- Node 18+
- Docker (for Redis)
- Supabase account
- OpenAI API key

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in your keys
uvicorn main:app --reload
```

### Celery Worker (separate terminal)
```bash
cd backend
source venv/bin/activate
celery -A celery_worker worker --loglevel=info
```

### Redis (Docker)
```bash
docker-compose up -d redis
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

See `backend/.env.example` for all required variables.

## Epics

| Epic | Description |
|---|---|
| E1 | Ingest and prepare learning content (upload, parse, clean, chunk) |
| E2 | Retrieve the right content for a given topic (hybrid search, citations) |
| E3 | Generate high-quality questions from retrieved context |

## Team

See `tasks/` folder for individual teammate assignments.
