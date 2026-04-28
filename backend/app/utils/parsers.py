"""
Document parsing using LlamaIndex readers.

All three parsers return a list of LlamaIndex Document objects with
page_label (or equivalent) populated in node metadata (AC-4.1.2).

The legacy parse_pdf / parse_docx / parse_pptx functions that returned
(page_num, text) tuples have been removed per AC-4.1.4.
retrieval.py uses LLAMAINDEX_PARSERS directly.
"""

import tempfile
from pathlib import Path
from llama_index.core import Document
from llama_index.readers.file import PDFReader, DocxReader, PptxReader


# ── LlamaIndex-based parsers ──────────────────────────────────────────────────

def parse_pdf_llamaindex(file_bytes: bytes) -> list[Document]:
    """Extract text per page from a PDF using LlamaIndex PDFReader."""
    reader = PDFReader()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = Path(tmp.name)

    try:
        documents = reader.load_data(tmp_path)
    finally:
        tmp_path.unlink()

    return documents


def parse_docx_llamaindex(file_bytes: bytes) -> list[Document]:
    """Extract text from DOCX using LlamaIndex DocxReader."""
    reader = DocxReader()
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = Path(tmp.name)

    try:
        documents = reader.load_data(tmp_path)
        # DOCX has no native pagination — default page_label to "1" for all chunks
        for doc in documents:
            if "page_label" not in doc.metadata:
                doc.metadata["page_label"] = "1"
    finally:
        tmp_path.unlink()

    return documents


def parse_pptx_llamaindex(file_bytes: bytes) -> list[Document]:
    """Extract text per slide from PPTX using LlamaIndex PptxReader."""
    reader = PptxReader()
    with tempfile.NamedTemporaryFile(suffix=".pptx", delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = Path(tmp.name)

    try:
        documents = reader.load_data(tmp_path)
        # Ensure page_label is present — PptxReader may not always set it
        for idx, doc in enumerate(documents, start=1):
            if "page_label" not in doc.metadata:
                doc.metadata["page_label"] = str(idx)
    finally:
        tmp_path.unlink()

    return documents


# ── Single parser registry (LlamaIndex API) ───────────────────────────────────
# Used by ingestion.py and retrieval.py fallback search.

LLAMAINDEX_PARSERS: dict[str, callable] = {
    ".pdf": parse_pdf_llamaindex,
    ".docx": parse_docx_llamaindex,
    ".pptx": parse_pptx_llamaindex,
}
