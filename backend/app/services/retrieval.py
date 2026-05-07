"""
E2 — Retrieve the right content for a given topic.
Primary: vector search via pgvector.
Fallback: if file hasn't been processed yet, extract text directly from storage
and do simple keyword-based relevance scoring — no embeddings needed.
"""

import re
import time
from pathlib import Path
from openai import OpenAI
from app.core.config import settings
from app.core.supabase import get_supabase
from app.utils.parsers import LLAMAINDEX_PARSERS
from app.core.logging import log_event

_openai = OpenAI(api_key=settings.openai_api_key)

# GPT-4o context limit we're comfortable using per request
MAX_CONTEXT_CHARS = 80_000


def embed_query(text: str) -> list[float]:
    response = _openai.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


def hybrid_search(topic: str, file_id: str | None = None, top_k: int = 10) -> list[dict]:
    supabase = get_supabase()
    _start = time.monotonic()

    # ── Vector search (only works if file has been embedded) ─────────────────
    embedding = embed_query(topic)
    vector_params = {"query_embedding": embedding, "match_count": top_k}
    if file_id:
        vector_params["filter_file_id"] = file_id

    vector_results = supabase.rpc("match_chunks", vector_params).execute()

    results = []
    for row in (vector_results.data or []):
        results.append({**row, "score": row.get("similarity", 0.0)})

    if results:
        final = sorted(results, key=lambda x: x["score"], reverse=True)[:top_k]
        log_event(
            "retrieval.search.completed",
            level="INFO",
            outcome="success",
            duration_ms=int((time.monotonic() - _start) * 1000),
            meta={"top_k": top_k, "chunks_returned": len(final), "fallback_keyword": False},
        )
        return final

    # ── Fallback: file not yet embedded — extract text directly ───────────────
    if file_id:
        fallback_results = _sync_extract_and_search(file_id, topic, top_k)
        log_event(
            "retrieval.search.completed",
            level="INFO",
            outcome="success",
            duration_ms=int((time.monotonic() - _start) * 1000),
            meta={"top_k": top_k, "chunks_returned": len(fallback_results), "fallback_keyword": True},
        )
        return fallback_results

    log_event(
        "retrieval.search.completed",
        level="INFO",
        outcome="success",
        duration_ms=int((time.monotonic() - _start) * 1000),
        meta={"top_k": top_k, "chunks_returned": 0, "fallback_keyword": False},
    )
    return []


def _sync_extract_and_search(file_id: str, topic: str, top_k: int) -> list[dict]:
    """
    Downloads the raw file from Supabase Storage, extracts text using
    LlamaIndex parsers (LLAMAINDEX_PARSERS), and returns the most relevant
    page-chunks using simple keyword scoring.
    No embeddings required — works immediately after upload.
    """
    supabase = get_supabase()

    # Find the file in storage
    try:
        listing = supabase.storage.from_("uploads").list(file_id)
        if not listing:
            return []
        filename = listing[0]["name"]
        file_bytes = supabase.storage.from_("uploads").download(f"{file_id}/{filename}")
    except Exception:
        return []

    # Parse using LlamaIndex parsers (returns Document objects)
    ext = Path(filename).suffix.lower()
    parser = LLAMAINDEX_PARSERS.get(ext)
    if not parser:
        return []

    try:
        documents = parser(file_bytes)
    except Exception:
        return []

    if not documents:
        return []

    # Build (page_num, text) pairs from Document objects for scoring
    pages = []
    for doc in documents:
        page_label = doc.metadata.get("page_label", "1")
        try:
            page_num = int(page_label)
        except (ValueError, TypeError):
            page_num = 1
        if doc.text and doc.text.strip():
            pages.append((page_num, doc.text))

    if not pages:
        return []

    # Score each page by keyword overlap with the topic
    topic_words = set(re.findall(r"\w+", topic.lower()))
    # Remove common stop words so we match on meaningful terms
    stop = {"the", "a", "an", "is", "in", "of", "and", "or", "to", "for", "with", "on", "at", "by"}
    topic_words -= stop

    scored = []
    for page_num, text in pages:
        page_words = set(re.findall(r"\w+", text.lower()))
        overlap = len(topic_words & page_words)
        scored.append((overlap, page_num, text))

    # Sort by relevance — always return at least top pages even if no overlap
    scored.sort(key=lambda x: x[0], reverse=True)
    top_pages = scored[:max(top_k, 10)]  # take more pages to give GPT context

    # Bundle into pseudo-chunks that fit in context
    chunks = []
    total_chars = 0
    for overlap, page_num, text in top_pages:
        if total_chars + len(text) > MAX_CONTEXT_CHARS:
            break
        chunks.append({
            "chunk_id": f"sync-{page_num}",
            "file_id": file_id,
            "text": text,
            "section_title": None,
            "page_numbers": [page_num],
            "score": overlap,
        })
        total_chars += len(text)

    return chunks
