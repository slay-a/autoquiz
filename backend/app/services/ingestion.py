"""
E1 — Ingest and prepare learning content.
Steps: parse → clean → detect sections → chunk → embed → store in pgvector
"""

import re
import uuid
from pathlib import Path
from app.core.config import settings
from app.utils.parsers import SUPPORTED_EXTENSIONS


# ── Cleaning ─────────────────────────────────────────────────────────────────

def clean_text(pages: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """Remove repeated headers/footers, deduplicate lines."""
    # Count line frequency across pages to detect headers/footers
    line_counts: dict[str, int] = {}
    for _, text in pages:
        for line in text.splitlines():
            stripped = line.strip()
            if stripped:
                line_counts[stripped] = line_counts.get(stripped, 0) + 1

    # Lines appearing on >50% of pages are likely headers/footers
    threshold = max(2, len(pages) * 0.5)
    noise_lines = {line for line, count in line_counts.items() if count >= threshold}

    cleaned = []
    for page_num, text in pages:
        lines = text.splitlines()
        filtered = [l for l in lines if l.strip() not in noise_lines]
        # Collapse excessive blank lines
        deduped = re.sub(r"\n{3,}", "\n\n", "\n".join(filtered)).strip()
        if deduped:
            cleaned.append((page_num, deduped))
    return cleaned


# ── Section Detection ─────────────────────────────────────────────────────────

HEADING_PATTERN = re.compile(
    r"^(Chapter\s+\d+|Section\s+\d+|\d+\.\d*\s+[A-Z]|[A-Z][A-Z\s]{4,}$)",
    re.MULTILINE,
)


def detect_sections(pages: list[tuple[int, str]]) -> list[dict]:
    """
    Returns list of sections: {title, start_page, end_page, text}
    Falls back to page-level sections if no headings detected.
    """
    sections = []
    current: dict | None = None

    for page_num, text in pages:
        for line in text.splitlines():
            if HEADING_PATTERN.match(line.strip()):
                if current:
                    sections.append(current)
                current = {
                    "title": line.strip(),
                    "start_page": page_num,
                    "end_page": page_num,
                    "text": "",
                }
        if current:
            current["end_page"] = page_num
            current["text"] += "\n" + text
        else:
            # No heading found yet — treat entire page as a section
            sections.append({
                "title": f"Page {page_num}",
                "start_page": page_num,
                "end_page": page_num,
                "text": text,
            })

    if current:
        sections.append(current)

    return sections


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_sections(
    sections: list[dict],
    file_id: str,
    chunk_size: int = 400,
    overlap: int = 60,
) -> list[dict]:
    """
    Split sections into overlapping token-approximate chunks.
    Each chunk stores: chunk_id, file_id, section_id, page_numbers, text.
    """
    chunks = []

    for section_idx, section in enumerate(sections):
        words = section["text"].split()
        start = 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunk_text = " ".join(words[start:end])
            chunks.append({
                "chunk_id": str(uuid.uuid4()),
                "file_id": file_id,
                "section_id": f"{file_id}_s{section_idx}",
                "section_title": section["title"],
                "page_numbers": list(range(section["start_page"], section["end_page"] + 1)),
                "text": chunk_text,
            })
            if end == len(words):
                break
            start += chunk_size - overlap  # sliding window with overlap

    return chunks


# ── Main ingestion entry point (called by Celery worker) ─────────────────────

def ingest_document(file_bytes: bytes, filename: str, file_id: str) -> list[dict]:
    """
    Full pipeline: parse → clean → detect sections → chunk.
    Returns list of chunks ready for embedding and storage.
    Raises ValueError with a stage label on failure.
    """
    ext = Path(filename).suffix.lower()
    parser = SUPPORTED_EXTENSIONS.get(ext)
    if not parser:
        raise ValueError(f"extract|Unsupported file type: {ext}")

    try:
        pages = parser(file_bytes)
    except Exception as e:
        raise ValueError(f"extract|{e}") from e

    try:
        cleaned = clean_text(pages)
    except Exception as e:
        raise ValueError(f"clean|{e}") from e

    try:
        sections = detect_sections(cleaned)
    except Exception as e:
        raise ValueError(f"section|{e}") from e

    try:
        chunks = chunk_sections(
            sections,
            file_id=file_id,
            chunk_size=settings.chunk_size_tokens,
            overlap=settings.chunk_overlap_tokens,
        )
    except Exception as e:
        raise ValueError(f"chunk|{e}") from e

    return chunks
