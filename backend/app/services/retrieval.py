"""
E2 — Retrieve the right content for a given topic.
Hybrid search: keyword (full-text) + vector (semantic) via Supabase pgvector.
"""

from openai import OpenAI
from app.core.config import settings
from app.core.supabase import get_supabase

_openai = OpenAI(api_key=settings.openai_api_key)


def embed_query(text: str) -> list[float]:
    response = _openai.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return response.data[0].embedding


def hybrid_search(topic: str, file_id: str | None = None, top_k: int = 10) -> list[dict]:
    """
    Combines:
      1. Vector search via pgvector (semantic similarity)
      2. Full-text keyword search via Postgres tsvector
    Results are merged and ranked by combined score.
    """
    supabase = get_supabase()
    embedding = embed_query(topic)

    # ── Vector search ─────────────────────────────────────────────────────────
    vector_params = {
        "query_embedding": embedding,
        "match_count": top_k,
    }
    if file_id:
        vector_params["filter_file_id"] = file_id

    vector_results = supabase.rpc("match_chunks", vector_params).execute()

    # ── Keyword search ────────────────────────────────────────────────────────
    query = supabase.table("chunks").select(
        "chunk_id, file_id, text, section_title, page_numbers"
    ).text_search("text", topic)

    if file_id:
        query = query.eq("file_id", file_id)

    keyword_results = query.limit(top_k).execute()

    # ── Merge & deduplicate ───────────────────────────────────────────────────
    seen: dict[str, dict] = {}

    for row in (vector_results.data or []):
        seen[row["chunk_id"]] = {**row, "score": row.get("similarity", 0.0)}

    for row in (keyword_results.data or []):
        cid = row["chunk_id"]
        if cid in seen:
            seen[cid]["score"] = min(1.0, seen[cid]["score"] + 0.1)  # boost on both hits
        else:
            seen[cid] = {**row, "score": 0.5}

    merged = sorted(seen.values(), key=lambda x: x["score"], reverse=True)
    return merged[:top_k]
