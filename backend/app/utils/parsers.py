"""
Document parsing using LlamaIndex readers.
- LlamaIndex functions return Document objects (for ingestion.py)
- Legacy functions return (page_num, text) tuples (for retrieval.py backward compat)
"""

import tempfile
from pathlib import Path
from llama_index.core import Document
from llama_index.readers.file import PDFReader, DocxReader, PptxReader


# ── LlamaIndex-based parsers (new API for ingestion) ─────────────────────────

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
        # DOCX has no native pagination, add default page metadata
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
    finally:
        tmp_path.unlink()

    return documents


# ── Legacy parsers (return (page_num, text) for backward compat) ─────────────

def parse_pdf(file_bytes: bytes) -> list[tuple[int, str]]:
    """
    Legacy wrapper: Extract text per page from PDF, returns (page_num, text) tuples.
    Used by retrieval.py for backward compatibility.
    """
    documents = parse_pdf_llamaindex(file_bytes)
    pages = []
    for doc in documents:
        page_num = int(doc.metadata.get("page_label", 1))
        if doc.text.strip():
            pages.append((page_num, doc.text))
    return pages


def parse_docx(file_bytes: bytes) -> list[tuple[int, str]]:
    """
    Legacy wrapper: Extract text from DOCX, returns [(1, text)].
    Used by retrieval.py for backward compatibility.
    """
    documents = parse_docx_llamaindex(file_bytes)
    if documents and documents[0].text.strip():
        return [(1, documents[0].text)]
    return []


def parse_pptx(file_bytes: bytes) -> list[tuple[int, str]]:
    """
    Legacy wrapper: Extract text per slide from PPTX, returns (slide_num, text) tuples.
    Used by retrieval.py for backward compatibility.
    """
    documents = parse_pptx_llamaindex(file_bytes)
    slides = []
    for idx, doc in enumerate(documents, start=1):
        if doc.text.strip():
            slides.append((idx, doc.text))
    return slides


# ── Export both APIs ──────────────────────────────────────────────────────────

SUPPORTED_PARSERS = {
    "application/pdf": parse_pdf,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": parse_docx,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": parse_pptx,
}

SUPPORTED_EXTENSIONS = {
    ".pdf": parse_pdf,
    ".docx": parse_docx,
    ".pptx": parse_pptx,
}

LLAMAINDEX_PARSERS = {
    ".pdf": parse_pdf_llamaindex,
    ".docx": parse_docx_llamaindex,
    ".pptx": parse_pptx_llamaindex,
}
