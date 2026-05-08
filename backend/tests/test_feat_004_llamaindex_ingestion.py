"""
Tests for FEAT-004 LlamaIndex Ingestion Refactor.

Tests cover:
- Story 4.1: LlamaIndex-based document parsing (parsers.py)
- Story 4.2: LlamaIndex SentenceSplitter for chunking (ingestion.py)
- Story 4.3: TextNode to chunks table mapping (ingestion.py)

Test strategy:
- Unit tests for parsers.py: mock LlamaIndex readers, verify Document objects
- Unit tests for ingestion.py: mock parsers + SentenceSplitter, verify return shape
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
from llama_index.core import Document
from llama_index.core.schema import TextNode

from app.utils.parsers import (
    parse_pdf_llamaindex,
    parse_docx_llamaindex,
    parse_pptx_llamaindex,
)
from app.services.ingestion import ingest_document
from app.core.exceptions import UnsupportedFileTypeError, ParseError, IngestionError


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def mock_pdf_bytes():
    """Mock PDF file bytes."""
    return b"mock_pdf_content"


@pytest.fixture
def mock_docx_bytes():
    """Mock DOCX file bytes."""
    return b"mock_docx_content"


@pytest.fixture
def mock_pptx_bytes():
    """Mock PPTX file bytes."""
    return b"mock_pptx_content"


@pytest.fixture
def sample_file_id():
    """Sample file ID for testing."""
    return "file-uuid-123"


# ── Unit Tests: parsers.py ────────────────────────────────────────────


class TestPDFParserLlamaIndex:
    """Tests for parse_pdf_llamaindex() using LlamaIndex PDFReader.

    AC-4.1.1 (PDF leg): the @patch("app.utils.parsers.PDFReader") path
    confirms the module's PDFReader symbol is the LlamaIndex reader; if
    parsers.py reverted to a custom PDF parser, the patch target wouldn't
    resolve and the test setup would fail.
    """

    @patch("app.utils.parsers.PDFReader")
    @patch("app.utils.parsers.tempfile.NamedTemporaryFile")
    def test_returns_document_objects_with_page_label(
        self, mock_tempfile, mock_reader_class, mock_pdf_bytes
    ):
        """AC-4.1.2: PDFReader returns Document objects with page_label metadata."""
        # Mock temp file
        mock_tmp = Mock()
        mock_tmp.name = "/tmp/test.pdf"
        mock_tmp.__enter__ = Mock(return_value=mock_tmp)
        mock_tmp.__exit__ = Mock(return_value=False)
        mock_tempfile.return_value = mock_tmp

        # Mock PDFReader instance
        mock_reader = Mock()
        mock_reader_class.return_value = mock_reader

        # Mock returned Documents
        mock_doc1 = Document(
            text="Page 1 content",
            metadata={"page_label": "1"}
        )
        mock_doc2 = Document(
            text="Page 2 content",
            metadata={"page_label": "2"}
        )
        mock_reader.load_data.return_value = [mock_doc1, mock_doc2]

        # Mock Path.unlink
        with patch.object(Path, "unlink"):
            result = parse_pdf_llamaindex(mock_pdf_bytes)

        assert len(result) == 2
        assert isinstance(result[0], Document)
        assert isinstance(result[1], Document)
        assert result[0].metadata["page_label"] == "1"
        assert result[1].metadata["page_label"] == "2"
        assert result[0].text == "Page 1 content"
        assert result[1].text == "Page 2 content"

    @patch("app.utils.parsers.PDFReader")
    @patch("app.utils.parsers.tempfile.NamedTemporaryFile")
    def test_cleans_up_temp_file(
        self, mock_tempfile, mock_reader_class, mock_pdf_bytes
    ):
        """Verify temporary file is deleted after parsing."""
        mock_tmp = Mock()
        mock_tmp.name = "/tmp/test.pdf"
        mock_tmp.__enter__ = Mock(return_value=mock_tmp)
        mock_tmp.__exit__ = Mock(return_value=False)
        mock_tempfile.return_value = mock_tmp

        mock_reader = Mock()
        mock_reader_class.return_value = mock_reader
        mock_reader.load_data.return_value = [
            Document(text="Test", metadata={"page_label": "1"})
        ]

        mock_path = Mock()
        with patch.object(Path, "unlink", mock_path):
            parse_pdf_llamaindex(mock_pdf_bytes)

        # Verify unlink was called
        mock_path.assert_called_once()


class TestDocxParserLlamaIndex:
    """Tests for parse_docx_llamaindex() using LlamaIndex DocxReader.

    AC-4.1.1 (DOCX leg): see PDF class docstring for the same patch-target
    rationale.
    """

    @patch("app.utils.parsers.DocxReader")
    @patch("app.utils.parsers.tempfile.NamedTemporaryFile")
    def test_returns_document_objects(
        self, mock_tempfile, mock_reader_class, mock_docx_bytes
    ):
        """AC-4.1.2: DocxReader returns Document objects."""
        mock_tmp = Mock()
        mock_tmp.name = "/tmp/test.docx"
        mock_tmp.__enter__ = Mock(return_value=mock_tmp)
        mock_tmp.__exit__ = Mock(return_value=False)
        mock_tempfile.return_value = mock_tmp

        mock_reader = Mock()
        mock_reader_class.return_value = mock_reader

        mock_doc = Document(
            text="DOCX content",
            metadata={}
        )
        mock_reader.load_data.return_value = [mock_doc]

        with patch.object(Path, "unlink"):
            result = parse_docx_llamaindex(mock_docx_bytes)

        assert len(result) == 1
        assert isinstance(result[0], Document)
        assert result[0].text == "DOCX content"

    @patch("app.utils.parsers.DocxReader")
    @patch("app.utils.parsers.tempfile.NamedTemporaryFile")
    def test_adds_default_page_label_when_missing(
        self, mock_tempfile, mock_reader_class, mock_docx_bytes
    ):
        """AC-4.1.2: DOCX has no pagination, default page_label to '1'."""
        mock_tmp = Mock()
        mock_tmp.name = "/tmp/test.docx"
        mock_tmp.__enter__ = Mock(return_value=mock_tmp)
        mock_tmp.__exit__ = Mock(return_value=False)
        mock_tempfile.return_value = mock_tmp

        mock_reader = Mock()
        mock_reader_class.return_value = mock_reader

        # Document without page_label
        mock_doc = Document(
            text="DOCX content",
            metadata={}
        )
        mock_reader.load_data.return_value = [mock_doc]

        with patch.object(Path, "unlink"):
            result = parse_docx_llamaindex(mock_docx_bytes)

        # Should have page_label added
        assert result[0].metadata["page_label"] == "1"

    @patch("app.utils.parsers.DocxReader")
    @patch("app.utils.parsers.tempfile.NamedTemporaryFile")
    def test_preserves_existing_page_label(
        self, mock_tempfile, mock_reader_class, mock_docx_bytes
    ):
        """If page_label exists, don't overwrite it."""
        mock_tmp = Mock()
        mock_tmp.name = "/tmp/test.docx"
        mock_tmp.__enter__ = Mock(return_value=mock_tmp)
        mock_tmp.__exit__ = Mock(return_value=False)
        mock_tempfile.return_value = mock_tmp

        mock_reader = Mock()
        mock_reader_class.return_value = mock_reader

        # Document with existing page_label
        mock_doc = Document(
            text="DOCX content",
            metadata={"page_label": "5"}
        )
        mock_reader.load_data.return_value = [mock_doc]

        with patch.object(Path, "unlink"):
            result = parse_docx_llamaindex(mock_docx_bytes)

        # Should preserve existing page_label
        assert result[0].metadata["page_label"] == "5"


class TestPptxParserLlamaIndex:
    """Tests for parse_pptx_llamaindex() using LlamaIndex PptxReader.

    AC-4.1.1 (PPTX leg): see PDF class docstring for the same patch-target
    rationale. The presence of all three reader-class patches across the
    three TestXxxParserLlamaIndex classes constitutes the AC-4.1.1
    coverage.
    """
    """Tests for parse_pptx_llamaindex() using LlamaIndex PptxReader."""

    @patch("app.utils.parsers.PptxReader")
    @patch("app.utils.parsers.tempfile.NamedTemporaryFile")
    def test_returns_document_objects_per_slide(
        self, mock_tempfile, mock_reader_class, mock_pptx_bytes
    ):
        """AC-4.1.2: PptxReader returns Document objects for each slide."""
        mock_tmp = Mock()
        mock_tmp.name = "/tmp/test.pptx"
        mock_tmp.__enter__ = Mock(return_value=mock_tmp)
        mock_tmp.__exit__ = Mock(return_value=False)
        mock_tempfile.return_value = mock_tmp

        mock_reader = Mock()
        mock_reader_class.return_value = mock_reader

        mock_doc1 = Document(text="Slide 1", metadata={"page_label": "1"})
        mock_doc2 = Document(text="Slide 2", metadata={"page_label": "2"})
        mock_doc3 = Document(text="Slide 3", metadata={"page_label": "3"})
        mock_reader.load_data.return_value = [mock_doc1, mock_doc2, mock_doc3]

        with patch.object(Path, "unlink"):
            result = parse_pptx_llamaindex(mock_pptx_bytes)

        assert len(result) == 3
        assert all(isinstance(doc, Document) for doc in result)
        assert result[0].text == "Slide 1"
        assert result[1].text == "Slide 2"
        assert result[2].text == "Slide 3"


# ── Unit Tests: ingestion.py ──────────────────────────────────────────


class TestIngestDocument:
    """Tests for ingest_document() service function.

    AC-4.2.2: the @patch("app.services.ingestion.SentenceSplitter") path and
    the use of `mock_splitter.get_nodes_from_documents.return_value` in
    every happy-path test below confirm `get_nodes_from_documents()` is the
    chunking entry point. If ingestion.py reverted to custom chunking
    (clean_text/detect_sections/chunk_sections), neither the patch nor the
    method assertion would resolve.
    """

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_happy_path_returns_correct_chunk_shape(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """AC-4.3.1: Returns list of dicts with correct keys."""
        # Mock parser
        mock_parser = Mock()
        mock_doc = Document(
            text="Sample document text for testing.",
            metadata={"page_label": "1"}
        )
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        # Mock SentenceSplitter
        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter

        mock_node = TextNode(
            text="Sample document text for testing.",
            metadata={"page_label": "1"}
        )
        mock_splitter.get_nodes_from_documents.return_value = [mock_node]

        result = ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        assert len(result) == 1
        chunk = result[0]

        # AC-4.3.1: Verify keys
        assert "chunk_id" in chunk
        assert "file_id" in chunk
        assert "section_id" in chunk
        assert "section_title" in chunk
        assert "page_numbers" in chunk
        assert "text" in chunk

        # AC-4.3.2: chunk_id is a UUID string
        assert isinstance(chunk["chunk_id"], str)
        assert len(chunk["chunk_id"]) == 36  # UUID format

        # Verify file_id
        assert chunk["file_id"] == sample_file_id

        # AC-4.3.3: page_numbers populated from page_label
        assert chunk["page_numbers"] == [1]

        # Verify text
        assert chunk["text"] == "Sample document text for testing."

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_page_numbers_from_page_label_metadata(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """AC-4.3.3: page_numbers is populated from node.metadata.get('page_label')."""
        mock_parser = Mock()
        mock_doc = Document(text="Test", metadata={"page_label": "5"})
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter

        mock_node = TextNode(
            text="Test content",
            metadata={"page_label": "5"}
        )
        mock_splitter.get_nodes_from_documents.return_value = [mock_node]

        result = ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        assert result[0]["page_numbers"] == [5]

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_page_numbers_defaults_to_one_when_missing(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """AC-4.3.3: page_numbers defaults to [1] if page_label is absent."""
        mock_parser = Mock()
        mock_doc = Document(text="Test", metadata={})
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter

        mock_node = TextNode(
            text="Test content",
            metadata={}  # No page_label
        )
        mock_splitter.get_nodes_from_documents.return_value = [mock_node]

        result = ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        assert result[0]["page_numbers"] == [1]

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_section_title_from_metadata(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """AC-4.3.4: section_title is populated from metadata if present."""
        mock_parser = Mock()
        mock_doc = Document(
            text="Test",
            metadata={"page_label": "1", "section_title": "Introduction"}
        )
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter

        mock_node = TextNode(
            text="Test content",
            metadata={"page_label": "1", "section_title": "Introduction"}
        )
        mock_splitter.get_nodes_from_documents.return_value = [mock_node]

        result = ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        assert result[0]["section_title"] == "Introduction"

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_section_title_defaults_to_none(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """AC-4.3.4: section_title defaults to None if not in metadata."""
        mock_parser = Mock()
        mock_doc = Document(text="Test", metadata={})
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter

        mock_node = TextNode(
            text="Test content",
            metadata={}
        )
        mock_splitter.get_nodes_from_documents.return_value = [mock_node]

        result = ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        assert result[0]["section_title"] is None

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_filters_empty_nodes(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """AC-4.2.4: Nodes with empty text are filtered out."""
        mock_parser = Mock()
        mock_doc = Document(text="Test", metadata={"page_label": "1"})
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter

        # Mix of valid and empty nodes
        mock_node1 = TextNode(text="Valid content", metadata={"page_label": "1"})
        mock_node2 = TextNode(text="", metadata={"page_label": "2"})
        mock_node3 = TextNode(text="   ", metadata={"page_label": "3"})
        mock_node4 = TextNode(text="Another valid", metadata={"page_label": "4"})

        mock_splitter.get_nodes_from_documents.return_value = [
            mock_node1, mock_node2, mock_node3, mock_node4
        ]

        result = ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        # Should only have 2 chunks (empty and whitespace-only filtered)
        assert len(result) == 2
        assert result[0]["text"] == "Valid content"
        assert result[1]["text"] == "Another valid"

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_uses_correct_chunk_size_settings(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """AC-4.2.1: SentenceSplitter uses chunk_size and chunk_overlap from settings."""
        mock_parser = Mock()
        mock_doc = Document(text="Test", metadata={})
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter
        mock_splitter.get_nodes_from_documents.return_value = []

        ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        # Verify SentenceSplitter was created with correct settings
        mock_splitter_class.assert_called_once_with(
            chunk_size=400,  # settings.chunk_size_tokens
            chunk_overlap=60,  # settings.chunk_overlap_tokens
        )

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    def test_raises_value_error_for_unsupported_file_type(
        self, mock_parsers_dict, sample_file_id
    ):
        """AC-4.1.3: Raises UnsupportedFileTypeError for unsupported file types."""
        # No parser for .txt files
        mock_parsers_dict.get.return_value = None

        with pytest.raises(UnsupportedFileTypeError) as exc_info:
            ingest_document(b"test", "test.txt", sample_file_id)

        error_msg = str(exc_info.value)
        assert "Unsupported file type" in error_msg
        assert ".txt" in error_msg

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    def test_raises_value_error_with_extract_stage_on_parse_failure(
        self, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """Parsing errors should raise ParseError (typed exception per DESIGN.md §3.1)."""
        mock_parser = Mock()
        mock_parser.side_effect = Exception("PDF corrupted")
        mock_parsers_dict.get.return_value = mock_parser

        with pytest.raises(ParseError) as exc_info:
            ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        error_msg = str(exc_info.value)
        assert "PDF corrupted" in error_msg

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_raises_value_error_with_chunk_stage_on_splitter_failure(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """Chunking errors should raise IngestionError (typed exception per DESIGN.md §3.1)."""
        mock_parser = Mock()
        mock_doc = Document(text="Test", metadata={})
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter
        mock_splitter.get_nodes_from_documents.side_effect = Exception("Splitter failed")

        with pytest.raises(IngestionError) as exc_info:
            ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        error_msg = str(exc_info.value)
        assert "Splitter failed" in error_msg

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_handles_multiple_chunks_from_same_document(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """Verify multiple chunks are returned correctly."""
        mock_parser = Mock()
        mock_doc = Document(text="Long document", metadata={"page_label": "1"})
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter

        # Multiple chunks from splitter
        mock_node1 = TextNode(text="Chunk 1", metadata={"page_label": "1"})
        mock_node2 = TextNode(text="Chunk 2", metadata={"page_label": "1"})
        mock_node3 = TextNode(text="Chunk 3", metadata={"page_label": "2"})

        mock_splitter.get_nodes_from_documents.return_value = [
            mock_node1, mock_node2, mock_node3
        ]

        result = ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        assert len(result) == 3
        assert result[0]["text"] == "Chunk 1"
        assert result[1]["text"] == "Chunk 2"
        assert result[2]["text"] == "Chunk 3"

        # Each chunk should have unique chunk_id
        chunk_ids = [chunk["chunk_id"] for chunk in result]
        assert len(chunk_ids) == len(set(chunk_ids))  # All unique

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_handles_page_range_in_page_label(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """Handle page_label with range format like '1-3'."""
        mock_parser = Mock()
        mock_doc = Document(text="Test", metadata={})
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter

        # Node with page range
        mock_node = TextNode(
            text="Content spanning pages",
            metadata={"page_label": "1-3"}
        )
        mock_splitter.get_nodes_from_documents.return_value = [mock_node]

        result = ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        # Should expand to list [1, 2, 3]
        assert result[0]["page_numbers"] == [1, 2, 3]

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    @patch("app.services.ingestion.SentenceSplitter")
    def test_handles_invalid_page_label_gracefully(
        self, mock_splitter_class, mock_parsers_dict, mock_pdf_bytes, sample_file_id
    ):
        """If page_label is invalid, default to [1]."""
        mock_parser = Mock()
        mock_doc = Document(text="Test", metadata={})
        mock_parser.return_value = [mock_doc]
        mock_parsers_dict.get.return_value = mock_parser

        mock_splitter = Mock()
        mock_splitter_class.return_value = mock_splitter

        # Node with invalid page_label
        mock_node = TextNode(
            text="Content",
            metadata={"page_label": "invalid"}
        )
        mock_splitter.get_nodes_from_documents.return_value = [mock_node]

        result = ingest_document(mock_pdf_bytes, "test.pdf", sample_file_id)

        # Should default to [1]
        assert result[0]["page_numbers"] == [1]
