# E2: Retrieve the Right Content for a Given Topic

## Stories Assigned

### US1 — Topic Search (P0, Sprint 2)
> As a learner, I want to search by topic keywords and get the most relevant passages.

**Files to work in:**
- `backend/app/services/retrieval.py` → `hybrid_search()` (scaffolded)
- `backend/app/api/routes/retrieve.py` (scaffolded)
- `backend/supabase_schema.sql` → `match_chunks` RPC + GIN index (scaffolded)

**Your job:**
- Connect the Supabase RPC `match_chunks` (vector search already written)
- Test: topic not in doc, topic appearing <10 times, exactly 10 times, >10 times
- Verify p95 latency ≤ 2 seconds
- Handle the case where fewer than 10 chunks exist — return what's available

---

### US2 — Hybrid Retrieval (P1, Sprint 2)
> As a user, I want hybrid retrieval (keyword + vector) so that acronyms and exact terms are not missed.

**Files to work in:**
- `backend/app/services/retrieval.py` — merge logic (scaffolded)

**Your job:**
- Test with acronyms and domain-specific abbreviations
- Tune the score merging weights (currently: +0.1 boost on both-hit)
- Document the final weighting strategy in a comment

---

### US3 — Citations (P0, Sprint 2)
> As a user, I want citations (page/section) for retrieved content.

**Files to work in:**
- `backend/app/models/schemas.py` → `ChunkResult` (has page_numbers, section_title)
- `frontend/src/components/QuizView.jsx` — citation display (scaffolded)

**Your job:**
- Ensure every returned chunk includes page_numbers and section_title
- Test: MLA/APA/Chicago formatted docs — citations should always show page number regardless of doc citation style (we're showing our own page refs, not the doc's)
- Display citations cleanly in the frontend

---

## Setup Reminder
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

Run the Supabase schema SQL first (enable pgvector + create chunks table + match_chunks function).
