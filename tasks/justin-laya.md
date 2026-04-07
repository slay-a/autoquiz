# Justin + Laya — E1: Ingest and Prepare Learning Content

## Stories Assigned

### US1 — File Upload (P0, Sprint 1)
> As an instructor, I want to upload PDF/DOCX/PPTX files so that the system can extract text for quiz generation.

**Files to work in:**
- `backend/app/api/routes/upload.py` — upload + status + retry endpoints (scaffolded)
- `backend/app/utils/parsers.py` — PDF/DOCX/PPTX extractors (scaffolded)

**Your job:**
- Wire up Supabase Storage upload (replace placeholder in `upload.py`)
- Test with files: 1MB, 45MB, 50MB (boundary), >50MB (should reject)
- Test all 3 formats
- Add integration test for each format

---

### US2 — Content Cleaning (P0, Sprint 1)
> As a user, I want extracted content cleaned (remove headers/footers/duplicates).

**Files to work in:**
- `backend/app/services/ingestion.py` → `clean_text()` function (scaffolded)

**Your job:**
- Improve header/footer detection (current: frequency threshold)
- Add test with a doc that has repeated headers — verify ≥80% duplicate reduction
- Store both raw and cleaned text in Supabase (`raw_text` column in chunks table)

---

### US6 — Processing Failure Logging (P0, Sprint 1)
> As an admin/instructor, I want processing failures logged with clear error reasons.

**Files to work in:**
- `backend/celery_worker.py` — error handling + job status updates (scaffolded)

**Your job:**
- Verify all 5 stages log correctly: upload | extract | clean | section | chunk
- Test retry: trigger a transient failure and confirm retry kicks in
- Add the `error_code` + `error_message` + `stage` to the job status API response

---

### US3 — Section Detection (P1, Sprint 2)
> As an instructor, I want automatic section/heading detection.

**Files to work in:**
- `backend/app/services/ingestion.py` → `detect_sections()` function (scaffolded)

**Your job:**
- Improve heading regex (current is basic)
- Test with a well-structured doc AND an unstructured doc
- Achieve ≥80% heading detection accuracy (spot check manually)

---

### US4 — Chunking (P0, Sprint 2)
> As an instructor, I want extracted content chunked into 200–500 token pieces with 10–20% overlap.

**Files to work in:**
- `backend/app/services/ingestion.py` → `chunk_sections()` function (scaffolded)
- `backend/supabase_schema.sql` — chunks table (scaffolded)

**Your job:**
- Verify chunk sizes are 200–500 tokens (use `tiktoken` for accurate token counts)
- Verify ≥95% of source text is covered (≤5% loss)
- Metadata check: each chunk has file_id, page_numbers, section_id, chunk_id

---

## Setup Reminder
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in keys
docker-compose up -d redis
uvicorn main:app --reload
# separate terminal:
celery -A celery_worker worker --loglevel=info
```
