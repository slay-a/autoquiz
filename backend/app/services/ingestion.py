"""
E1 — Ingest and prepare learning content.
Steps: parse via LlamaIndex readers → chunk via SentenceSplitter → embed → store in pgvector
"""

import uuid
from pathlib import Path
from llama_index.core.node_parser import SentenceSplitter
from openai import OpenAI
from app.core.config import settings
from app.core.supabase import get_supabase
from app.utils.parsers import LLAMAINDEX_PARSERS


# ── Main ingestion entry point (called by Celery worker) ─────────────────────

def ingest_document(file_bytes: bytes, filename: str, file_id: str) -> list[dict]:
    """
    Full pipeline: parse via LlamaIndex readers → chunk via SentenceSplitter.
    Returns list of chunks ready for embedding and storage.
    Raises ValueError with a stage label on failure.
    """
    ext = Path(filename).suffix.lower()
    parser = LLAMAINDEX_PARSERS.get(ext)
    if not parser:
        raise ValueError(f"extract|Unsupported file type: {ext}")

    # ── Parse: extract Documents with page metadata ──
    try:
        documents = parser(file_bytes)
    except Exception as e:
        raise ValueError(f"extract|{e}") from e

    # ── Chunk: use LlamaIndex SentenceSplitter ──
    try:
        splitter = SentenceSplitter(
            chunk_size=settings.chunk_size_tokens,
            chunk_overlap=settings.chunk_overlap_tokens,
        )
        nodes = splitter.get_nodes_from_documents(documents)
    except Exception as e:
        raise ValueError(f"chunk|{e}") from e

    # ── Map TextNode → chunks table schema ──
    chunks = []
    for node in nodes:
        # Skip empty nodes
        if not node.text or not node.text.strip():
            continue

        # Extract page numbers from metadata
        page_label = node.metadata.get("page_label")
        if page_label:
            # page_label can be a string like "1" or "1-3"
            try:
                if "-" in str(page_label):
                    start, end = map(int, str(page_label).split("-"))
                    page_numbers = list(range(start, end + 1))
                else:
                    page_numbers = [int(page_label)]
            except (ValueError, AttributeError):
                page_numbers = [1]
        else:
            page_numbers = [1]

        # Extract section title from metadata
        section_title = node.metadata.get("section_title")

        # Generate section_id based on section_title or use a default
        if section_title:
            section_id = f"{file_id}_{hash(section_title) % 10000}"
        else:
            section_id = f"{file_id}_default"

        chunks.append({
            "chunk_id": str(uuid.uuid4()),
            "file_id": file_id,
            "section_id": section_id,
            "section_title": section_title,
            "page_numbers": page_numbers,
            "text": node.text,
        })

    return chunks


# ── Embedding (Layer 2 — all OpenAI calls live here per DESIGN.md §7 rule 1) ─

def embed_chunks(chunks: list[dict]) -> list[dict]:
    """
    Embed a list of chunk dicts (output of ingest_document) using
    text-embedding-3-small. Returns a new list of dicts with an added
    'embedding' key containing the vector.

    Raises ValueError("embed|<message>") on OpenAI error so the Celery
    task can map it to EMBED_FAILED.
    """
    if not chunks:
        return []

    try:
        client = OpenAI(api_key=settings.openai_api_key)
        texts = [c["text"] for c in chunks]
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        embeddings = [e.embedding for e in response.data]
    except Exception as exc:
        raise ValueError(f"embed|{exc}") from exc

    return [
        {**chunk, "embedding": embedding}
        for chunk, embedding in zip(chunks, embeddings)
    ]


# ── Storage (Layer 2 — DB writes live here per DESIGN.md §0 rule 8) ──────────

def store_chunks(chunks_with_embeddings: list[dict]) -> None:
    """
    Insert a list of fully-populated chunk dicts (including 'embedding' field)
    into the 'chunks' table via the Supabase client.

    Raises ValueError("chunk|<message>") on DB error so the Celery task
    can map it to CHUNK_FAILED.
    """
    if not chunks_with_embeddings:
        return

    rows = [
        {
            "chunk_id": c["chunk_id"],
            "file_id": c["file_id"],
            "section_id": c["section_id"],
            "section_title": c["section_title"],
            "page_numbers": c["page_numbers"],
            "text": c["text"],
            "embedding": c["embedding"],
        }
        for c in chunks_with_embeddings
    ]

    try:
        supabase = get_supabase()
        supabase.table("chunks").insert(rows).execute()
    except Exception as exc:
        raise ValueError(f"chunk|{exc}") from exc
