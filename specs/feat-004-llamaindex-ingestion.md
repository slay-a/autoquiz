# Feature Brief: LlamaIndex Ingestion Pipeline

---

## 1. Summary

**Feature:** Replace the custom document parser and chunker in the ingestion pipeline with LlamaIndex readers (`PDFReader`, `DocxReader`, `PptxReader`) and `SentenceSplitter`, while keeping all output written to the existing `chunks` table schema unchanged.
**Requested by:** Internal
**Priority:** High

This feature is already implemented. This spec exists to onboard the feature into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

---

## 2. User Stories

### Story 4.1 — LlamaIndex-based document parsing

**As the system**,
**I want** document files to be parsed using LlamaIndex readers,
**so that** text extraction is handled by a maintained library rather than bespoke PyMuPDF/python-docx/python-pptx code.

**Acceptance Criteria:**
- [x] AC-4.1.1: `backend/app/utils/parsers.py` uses `llama_index.readers.file` readers (`PDFReader`, `DocxReader`, `PptxReader`) to extract content from uploaded files.
- [x] AC-4.1.2: Each reader returns a list of LlamaIndex `Document` objects with `page_label` (or equivalent) populated in node metadata.
- [x] AC-4.1.3: `.pdf`, `.docx`, and `.pptx` extensions are the only accepted file types; all others raise a `ValueError` with the `extract|` stage prefix.
- [x] AC-4.1.4: The old custom `parse_pdf`, `parse_docx`, `parse_pptx` functions and `fitz`/`docx`/`pptx` direct imports are removed from `parsers.py`.

---

### Story 4.2 — LlamaIndex SentenceSplitter for chunking

**As the system**,
**I want** parsed documents to be chunked using LlamaIndex's `SentenceSplitter`,
**so that** chunk boundaries are semantically coherent rather than split on raw word counts.

**Acceptance Criteria:**
- [x] AC-4.2.1: `backend/app/services/ingestion.py` creates a `SentenceSplitter` with `chunk_size=settings.chunk_size_tokens` and `chunk_overlap=settings.chunk_overlap_tokens`.
- [x] AC-4.2.2: `SentenceSplitter.get_nodes_from_documents()` replaces the custom `clean_text`, `detect_sections`, and `chunk_sections` functions.
- [x] AC-4.2.3: The custom `clean_text`, `detect_sections`, and `chunk_sections` functions are removed from `ingestion.py`.
- [x] AC-4.2.4: Each resulting `TextNode` has non-empty `text`.

---

### Story 4.3 — TextNode → chunks table mapping

**As the system**,
**I want** LlamaIndex `TextNode` objects to be mapped to the existing `chunks` table schema,
**so that** no database schema changes are required and all downstream retrieval logic continues to work unchanged.

**Acceptance Criteria:**
- [x] AC-4.3.1: `ingest_document` returns a list of dicts with keys `chunk_id`, `file_id`, `section_id`, `section_title`, `page_numbers`, `text` — identical shape to the existing contract.
- [x] AC-4.3.2: `chunk_id` is a new `uuid4` string per node.
- [x] AC-4.3.3: `page_numbers` is populated from `node.metadata.get("page_label")` if present, defaulting to `[1]` if absent.
- [x] AC-4.3.4: `section_title` is populated from `node.metadata.get("section_title")` if present, defaulting to `None`.
- [x] AC-4.3.5: No LlamaIndex `VectorStoreIndex`, `StorageContext`, or `SupabaseVectorStore` classes are used — storage is written directly to the `chunks` table by the Celery worker.

---

## 3. Role & Access Rules

This feature is entirely backend/infrastructure. There are no new actor-facing permissions.

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Instructor | Upload files (unchanged) | — | `backend/app/api/routes/upload.py` |
| Student | Upload files (unchanged) | — | `backend/app/api/routes/upload.py` |
| Unauthenticated | None | All actions | FastAPI auth dependency |

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes — unchanged. The `chunks` table schema is not modified.
- **Migration required:** No.

### 4b. Backend architecture

- **Logic lives in:**
  - `backend/app/utils/parsers.py` — replace custom parser functions with LlamaIndex reader wrappers; still Layer 3 (Infrastructure)
  - `backend/app/services/ingestion.py` — replace `clean_text`, `detect_sections`, `chunk_sections` with `SentenceSplitter`; `ingest_document` signature and return shape are unchanged
- **Async / sync?** Celery background task — unchanged
- **LLM involvement?** No

### 4c. Frontend architecture

- **No frontend changes.** The upload flow, job status polling, and all pages are unaffected.

### 4d. RAG pipeline impact

- **Affects chunking?** Yes — this is the change.
- **Affects embedding?** No — embeddings are generated from `chunk["text"]` which still exists.
- **Affects retrieval query?** No — `chunks` table schema is unchanged; `match_chunks` RPC is unchanged.
- **Affects LLM prompt?** No.

### 4e. Security considerations

- **User-controlled data injected into LLM prompts?** No.
- **New SQL queries?** No.
- **CORS / auth headers affected?** No.

---

## 5. Out of Scope

- No changes to the `chunks` table schema or the `supabase_schema.sql` file.
- No changes to the retrieval service (`services/retrieval.py`).
- No changes to quiz or notes generation services.
- No use of LlamaIndex's vector store, index, or query engine abstractions.
- No changes to the `processing_jobs` stage labels (`extract`, `chunk` remain valid).
- No frontend changes of any kind.
- LlamaIndex's `OpenAIEmbedding` is not used — embedding calls remain in the Celery worker using the OpenAI client directly.

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Does `DocxReader` in LlamaIndex produce page-level metadata for DOCX files? | Internal | Resolved: DOCX has no native pagination — default to `page_numbers: [1]` for all DOCX chunks, same as the existing implementation. |
| 2 | Which LlamaIndex package provides the file readers? | Internal | Resolved: `llama-index-readers-file` (part of `llama-index` core install); PDFReader uses `pypdf` under the hood. |

---

## 7. Test Boundaries

- **External deps to mock:** LlamaIndex reader classes (or provide real small fixture files for integration tests)
- **Fixtures needed:** Small `.pdf`, `.docx`, `.pptx` test files in `backend/tests/fixtures/`
- **Integration vs. unit boundary:**
  - `parsers.py` reader wrappers = unit tests with fixture files
  - `ingest_document` end-to-end = integration test asserting correct chunk dict shape
- **Frontend test targets:** None — no frontend changes
- **Explicitly out of test scope:** live OpenAI embedding calls, live Supabase writes

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-004-llamaindex-ingestion.md`
