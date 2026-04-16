"""
E1 — Ingest and prepare learning content.
Steps: parse via LlamaIndex readers → chunk via SentenceSplitter → embed → store in pgvector
"""

import uuid
from pathlib import Path
from llama_index.core.node_parser import SentenceSplitter
from app.core.config import settings
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
