"""
Red-phase tests for FEAT-004 LlamaIndex Ingestion — gap closure.

Pins the following blockers:
  B1 — AC-4.1.4: Legacy parse_pdf/docx/pptx functions and SUPPORTED_PARSERS /
       SUPPORTED_EXTENSIONS dicts must be removed from parsers.py; retrieval.py
       must use LLAMAINDEX_PARSERS instead.
  B2 — DESIGN.md §3.1: exceptions.py defining AutoQuizError hierarchy must exist.
  B3 — DESIGN.md §3.1: ingestion.py must raise typed IngestionError subclasses,
       not raw ValueError with string-encoded stage prefixes.
  B4 — DESIGN.md §0 rule 8: celery_worker.py _update_job must not call
       get_supabase() directly; job-status updates must go through a service function.
  B5 — DESIGN.md §14.3: ingestion pipeline must emit structured log events
       (ingestion.job.started, ingestion.job.completed, ingestion.job.failed)
       via log_event().

All tests here are expected to FAIL against the current codebase.
"""

import importlib
import inspect
import sys
import types
import pytest
from unittest.mock import Mock, patch, MagicMock, call


# ─────────────────────────────────────────────────────────────────────────────
# B1 — AC-4.1.4: Legacy functions/dicts must NOT exist in parsers.py
# ─────────────────────────────────────────────────────────────────────────────

class TestB1LegacyFunctionsRemoved:
    """
    AC-4.1.4: parse_pdf, parse_docx, parse_pptx (the legacy tuple-returning
    wrappers), SUPPORTED_PARSERS, and SUPPORTED_EXTENSIONS must be removed from
    parsers.py.
    """

    def test_parse_pdf_not_exported_from_parsers(self):
        """Legacy parse_pdf must not be importable from app.utils.parsers."""
        import app.utils.parsers as p
        assert not hasattr(p, "parse_pdf"), (
            "parse_pdf still present in parsers.py — AC-4.1.4 requires removal"
        )

    def test_parse_docx_not_exported_from_parsers(self):
        """Legacy parse_docx must not be importable from app.utils.parsers."""
        import app.utils.parsers as p
        assert not hasattr(p, "parse_docx"), (
            "parse_docx still present in parsers.py — AC-4.1.4 requires removal"
        )

    def test_parse_pptx_not_exported_from_parsers(self):
        """Legacy parse_pptx must not be importable from app.utils.parsers."""
        import app.utils.parsers as p
        assert not hasattr(p, "parse_pptx"), (
            "parse_pptx still present in parsers.py — AC-4.1.4 requires removal"
        )

    def test_supported_parsers_dict_not_in_parsers(self):
        """SUPPORTED_PARSERS dict (MIME-keyed) must be removed from parsers.py."""
        import app.utils.parsers as p
        assert not hasattr(p, "SUPPORTED_PARSERS"), (
            "SUPPORTED_PARSERS dict still present in parsers.py — AC-4.1.4 requires removal"
        )

    def test_supported_extensions_dict_not_in_parsers(self):
        """SUPPORTED_EXTENSIONS dict (ext-keyed to legacy functions) must be removed from parsers.py."""
        import app.utils.parsers as p
        assert not hasattr(p, "SUPPORTED_EXTENSIONS"), (
            "SUPPORTED_EXTENSIONS dict still present in parsers.py — AC-4.1.4 requires removal"
        )

    def test_retrieval_does_not_import_supported_extensions(self):
        """retrieval.py must not import SUPPORTED_EXTENSIONS (legacy dict)."""
        import ast, pathlib
        retrieval_src = pathlib.Path(
            "/Users/shabnamjabbari/Documents/GitHub/autoquiz/backend/app/services/retrieval.py"
        ).read_text()
        tree = ast.parse(retrieval_src)
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                if isinstance(node, ast.ImportFrom) and node.module:
                    for alias in node.names:
                        assert alias.name != "SUPPORTED_EXTENSIONS", (
                            "retrieval.py still imports SUPPORTED_EXTENSIONS — must use LLAMAINDEX_PARSERS"
                        )

    def test_retrieval_uses_llamaindex_parsers_for_fallback(self):
        """retrieval.py fallback search must use LLAMAINDEX_PARSERS, not legacy wrappers."""
        import ast, pathlib
        retrieval_src = pathlib.Path(
            "/Users/shabnamjabbari/Documents/GitHub/autoquiz/backend/app/services/retrieval.py"
        ).read_text()
        assert "LLAMAINDEX_PARSERS" in retrieval_src, (
            "retrieval.py does not reference LLAMAINDEX_PARSERS — "
            "fallback search must be updated to use LlamaIndex parsers"
        )


# ─────────────────────────────────────────────────────────────────────────────
# B2 — exceptions.py must exist with AutoQuizError hierarchy
# ─────────────────────────────────────────────────────────────────────────────

class TestB2ExceptionsModuleExists:
    """DESIGN.md §3.1: exceptions.py must define the AutoQuizError hierarchy."""

    def test_exceptions_module_importable(self):
        """app.core.exceptions must be importable."""
        try:
            import app.core.exceptions as exc_mod
        except ModuleNotFoundError:
            pytest.fail(
                "app.core.exceptions does not exist — DESIGN.md §3.1 requires it"
            )

    def test_auto_quiz_error_base_class_exists(self):
        """AutoQuizError base class must be defined."""
        import app.core.exceptions as exc_mod
        assert hasattr(exc_mod, "AutoQuizError"), (
            "AutoQuizError not found in exceptions.py"
        )

    def test_ingestion_error_exists(self):
        """IngestionError must subclass AutoQuizError."""
        import app.core.exceptions as exc_mod
        assert hasattr(exc_mod, "IngestionError"), (
            "IngestionError not found in exceptions.py"
        )
        assert issubclass(exc_mod.IngestionError, exc_mod.AutoQuizError)

    def test_unsupported_file_type_error_exists(self):
        """UnsupportedFileTypeError must subclass IngestionError."""
        import app.core.exceptions as exc_mod
        assert hasattr(exc_mod, "UnsupportedFileTypeError"), (
            "UnsupportedFileTypeError not found in exceptions.py"
        )
        assert issubclass(exc_mod.UnsupportedFileTypeError, exc_mod.IngestionError)

    def test_parse_error_exists(self):
        """ParseError must subclass IngestionError."""
        import app.core.exceptions as exc_mod
        assert hasattr(exc_mod, "ParseError"), (
            "ParseError not found in exceptions.py"
        )
        assert issubclass(exc_mod.ParseError, exc_mod.IngestionError)

    def test_embedding_error_exists(self):
        """EmbeddingError must subclass IngestionError."""
        import app.core.exceptions as exc_mod
        assert hasattr(exc_mod, "EmbeddingError"), (
            "EmbeddingError not found in exceptions.py"
        )
        assert issubclass(exc_mod.EmbeddingError, exc_mod.IngestionError)


# ─────────────────────────────────────────────────────────────────────────────
# B3 — ingestion.py must raise typed exceptions, not raw ValueError
# ─────────────────────────────────────────────────────────────────────────────

class TestB3TypedExceptionsInIngestion:
    """
    DESIGN.md §3.1: Services raise typed exceptions from exceptions.py.
    ingest_document must raise UnsupportedFileTypeError / ParseError / EmbeddingError,
    not ValueError with string-encoded stage prefix.
    """

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS", {})
    def test_unsupported_type_raises_typed_exception(self):
        """ingest_document must raise UnsupportedFileTypeError (not ValueError) for bad ext."""
        from app.services.ingestion import ingest_document
        from app.core.exceptions import UnsupportedFileTypeError
        with pytest.raises(UnsupportedFileTypeError):
            ingest_document(b"data", "file.txt", "fid-001")

    @patch("app.services.ingestion.SentenceSplitter")
    def test_parse_failure_raises_parse_error(self, mock_splitter_class):
        """ingest_document must raise ParseError (not ValueError) when parser throws."""
        from app.services.ingestion import ingest_document
        from app.core.exceptions import ParseError

        bad_parser = Mock(side_effect=RuntimeError("corrupted"))
        with patch.dict("app.services.ingestion.LLAMAINDEX_PARSERS", {".pdf": bad_parser}):
            with pytest.raises(ParseError):
                ingest_document(b"data", "file.pdf", "fid-001")

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS")
    def test_chunk_failure_raises_ingestion_error(self, mock_parsers):
        """ingest_document must raise IngestionError subclass when splitter fails."""
        from app.services.ingestion import ingest_document
        from app.core.exceptions import IngestionError
        from llama_index.core import Document

        mock_parser = Mock(return_value=[Document(text="text", metadata={})])
        mock_parsers.get.return_value = mock_parser

        with patch("app.services.ingestion.SentenceSplitter") as mock_cls:
            mock_splitter = Mock()
            mock_cls.return_value = mock_splitter
            mock_splitter.get_nodes_from_documents.side_effect = RuntimeError("splitter crash")

            with pytest.raises(IngestionError):
                ingest_document(b"data", "file.pdf", "fid-001")

    @patch("app.services.ingestion.LLAMAINDEX_PARSERS", {})
    def test_unsupported_type_does_not_raise_plain_value_error(self):
        """ValueError (string-encoded) must NOT be raised for unsupported types."""
        from app.services.ingestion import ingest_document
        try:
            ingest_document(b"data", "file.txt", "fid-001")
        except ValueError as e:
            pytest.fail(
                f"ingest_document raised plain ValueError instead of typed exception: {e}"
            )
        except Exception:
            pass  # Any typed exception is acceptable (handled in other tests)

    def test_embed_chunks_raises_embedding_error_not_value_error(self):
        """embed_chunks must raise EmbeddingError (not ValueError) on OpenAI failure."""
        from app.services.ingestion import embed_chunks
        from app.core.exceptions import EmbeddingError

        chunk = {"chunk_id": "c1", "file_id": "f1", "text": "hello"}
        with patch("app.services.ingestion.OpenAI") as mock_openai_cls:
            mock_client = Mock()
            mock_openai_cls.return_value = mock_client
            mock_client.embeddings.create.side_effect = RuntimeError("openai down")

            with pytest.raises(EmbeddingError):
                embed_chunks([chunk])


# ─────────────────────────────────────────────────────────────────────────────
# B4 — celery_worker.py _update_job must use a service function, not get_supabase directly
# ─────────────────────────────────────────────────────────────────────────────

class TestB4CeleryTaskServiceLayerCompliance:
    """
    DESIGN.md §0 rule 8: A task body must call service functions, not reach into
    app.core directly. The _update_job helper must be moved to a service or
    the task must call a service-layer function for DB writes.
    """

    def test_celery_worker_does_not_call_get_supabase_directly(self):
        """
        celery_worker.py must not import or call get_supabase() directly at
        module level or inside task/helper functions. DB updates belong in a
        service function.
        """
        import ast, pathlib
        worker_src = pathlib.Path(
            "/Users/shabnamjabbari/Documents/GitHub/autoquiz/backend/celery_worker.py"
        ).read_text()
        tree = ast.parse(worker_src)

        # Check that get_supabase is not imported at module level in the worker
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module and "supabase" in node.module:
                    for alias in node.names:
                        assert alias.name != "get_supabase", (
                            "celery_worker.py imports get_supabase directly — "
                            "DB writes must go through a service function (DESIGN.md §0 rule 8)"
                        )

    def test_update_job_function_lives_in_service_not_worker(self):
        """
        Job-status update logic (_update_job / update_job_status) must be
        callable from a service module (e.g. app.services.upload or a new
        app.services.jobs), not defined inside celery_worker.py as a private
        helper that directly calls get_supabase().
        """
        # The service layer should expose a job-status update function
        try:
            from app.services import upload as upload_svc
            # Either upload_svc or another service module must expose the update
            has_update = (
                hasattr(upload_svc, "update_job_status")
                or hasattr(upload_svc, "update_job")
            )
        except ImportError:
            has_update = False

        assert has_update, (
            "No update_job_status / update_job function found in app.services.upload — "
            "the Celery worker's _update_job helper must be moved to the service layer"
        )


# ─────────────────────────────────────────────────────────────────────────────
# B5 — ingestion pipeline must emit structured log events
# ─────────────────────────────────────────────────────────────────────────────

class TestB5StructuredLoggingInIngestion:
    """
    DESIGN.md §14.3: ingestion.job.started, ingestion.job.completed, and
    ingestion.job.failed must be emitted via log_event() from the Celery task.
    """

    def test_celery_worker_imports_log_event(self):
        """celery_worker.py must import log_event from app.core.logging."""
        import ast, pathlib
        worker_src = pathlib.Path(
            "/Users/shabnamjabbari/Documents/GitHub/autoquiz/backend/celery_worker.py"
        ).read_text()
        tree = ast.parse(worker_src)
        found_log_event = False
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module and "logging" in node.module:
                    for alias in node.names:
                        if alias.name == "log_event":
                            found_log_event = True
        assert found_log_event, (
            "celery_worker.py does not import log_event — "
            "DESIGN.md §14 requires all state-changing actions to emit structured events"
        )

    def test_celery_worker_emits_ingestion_job_started(self):
        """celery_worker.py must emit the 'ingestion.job.started' event."""
        import pathlib
        worker_src = pathlib.Path(
            "/Users/shabnamjabbari/Documents/GitHub/autoquiz/backend/celery_worker.py"
        ).read_text()
        assert "ingestion.job.started" in worker_src, (
            "celery_worker.py does not emit 'ingestion.job.started' — "
            "required by DESIGN.md §14.3 event catalog"
        )

    def test_celery_worker_emits_ingestion_job_completed(self):
        """celery_worker.py must emit the 'ingestion.job.completed' event."""
        import pathlib
        worker_src = pathlib.Path(
            "/Users/shabnamjabbari/Documents/GitHub/autoquiz/backend/celery_worker.py"
        ).read_text()
        assert "ingestion.job.completed" in worker_src, (
            "celery_worker.py does not emit 'ingestion.job.completed' — "
            "required by DESIGN.md §14.3 event catalog"
        )

    def test_celery_worker_emits_ingestion_job_failed(self):
        """celery_worker.py must emit the 'ingestion.job.failed' event."""
        import pathlib
        worker_src = pathlib.Path(
            "/Users/shabnamjabbari/Documents/GitHub/autoquiz/backend/celery_worker.py"
        ).read_text()
        assert "ingestion.job.failed" in worker_src, (
            "celery_worker.py does not emit 'ingestion.job.failed' — "
            "required by DESIGN.md §14.3 event catalog"
        )

    def test_log_event_called_on_task_start(self):
        """process_document task must call log_event with 'ingestion.job.started' at task entry."""
        from unittest.mock import patch, MagicMock
        import celery_worker

        with patch("celery_worker.log_event") as mock_log, \
             patch("celery_worker.download_file_bytes", return_value=b"bytes"), \
             patch("celery_worker.update_job_status"), \
             patch("celery_worker.ingest_document", return_value=[]), \
             patch("celery_worker.embed_chunks", return_value=[]), \
             patch("celery_worker.store_chunks"):

            # Run task logic directly (bypass Celery)
            task = celery_worker.process_document
            try:
                task.run("file-id-1", "job-id-1", "test.pdf")
            except Exception:
                pass  # We only care that log_event was called

            events_emitted = [c.kwargs.get("event") or (c.args[0] if c.args else None)
                               for c in mock_log.call_args_list]
            assert "ingestion.job.started" in events_emitted, (
                f"'ingestion.job.started' not emitted. Events: {events_emitted}"
            )
