"""
Red-phase tests for Issue #19 — DESIGN.md §0 layer boundary violation.

Blockers pinned:
1. CRITICAL: celery_worker.py instantiates OpenAI client and calls
   embeddings.create directly, bypassing Layer 2 (services/).
   Fix: embed_chunks() must exist in app/services/ingestion.py and be
   called by the Celery task.

2. CRITICAL: celery_worker.py writes chunks to the DB directly via
   supabase.table("chunks").insert(), bypassing Layer 2.
   Fix: store_chunks() must exist in app/services/ingestion.py and be
   called by the Celery task.

3. MAJOR: celery_worker.py uses undocumented error codes
   PROCESSING_ERROR and UNEXPECTED_ERROR. Registry codes must be used.
"""

import ast
import inspect
import sys
import types
import importlib
from pathlib import Path
from unittest.mock import patch, Mock, MagicMock, call
import pytest

# Ensure backend is on path (conftest.py already sets this, but guard it)
BACKEND_DIR = Path(__file__).parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


# ── Helpers ────────────────────────────────────────────────────────────────

def _read_celery_source() -> str:
    """Return source code of celery_worker.py."""
    path = BACKEND_DIR / "celery_worker.py"
    return path.read_text()


def _read_ingestion_source() -> str:
    """Return source code of app/services/ingestion.py."""
    path = BACKEND_DIR / "app" / "services" / "ingestion.py"
    return path.read_text()


# ── BLOCKER 1 & 2: Layer boundary — OpenAI and DB write must be in services/ ──


class TestOpenAINotDirectlyInCeleryTask:
    """
    CRITICAL (DESIGN.md §0 rule 8, §7 rule 1):
    The Celery task must NOT import openai or instantiate an OpenAI client.
    All OpenAI calls must live in app/services/.
    """

    def test_celery_worker_does_not_import_openai(self):
        """
        celery_worker.py must not contain 'from openai import' or 'import openai'.
        If it does, the layer boundary is violated (CRITICAL per §0 rule 8).
        """
        src = _read_celery_source()
        tree = ast.parse(src)

        openai_imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "openai" or alias.name.startswith("openai."):
                        openai_imports.append(f"import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                if node.module and (node.module == "openai" or node.module.startswith("openai.")):
                    names = [a.name for a in node.names]
                    openai_imports.append(f"from {node.module} import {', '.join(names)}")

        assert openai_imports == [], (
            f"celery_worker.py must not import from openai directly "
            f"(DESIGN.md §0 rule 8, §7 rule 1). Found: {openai_imports}"
        )

    def test_celery_worker_does_not_instantiate_openai_client(self):
        """
        celery_worker.py must not call OpenAI(...) to instantiate a client.
        All OpenAI client usage must live in app/services/.
        """
        src = _read_celery_source()
        # Look for OpenAI(...) call pattern
        assert "OpenAI(" not in src, (
            "celery_worker.py must not instantiate an OpenAI client directly. "
            "Move this to app/services/ingestion.py (DESIGN.md §0 rule 8, §7 rule 1)."
        )

    def test_celery_worker_does_not_call_embeddings_create(self):
        """
        celery_worker.py must not call .embeddings.create() directly.
        Embedding must be delegated to a service function.
        """
        src = _read_celery_source()
        assert "embeddings.create(" not in src, (
            "celery_worker.py must not call .embeddings.create() directly "
            "(DESIGN.md §7 rule 1). Delegate to a service function in "
            "app/services/ingestion.py."
        )


class TestEmbedChunksFunctionExistsInIngestionService:
    """
    CRITICAL (DESIGN.md §7 rule 1):
    A dedicated embed_chunks() function must exist in app/services/ingestion.py
    so the Celery task can delegate embedding logic there.
    """

    def test_embed_chunks_function_exists_in_ingestion(self):
        """
        app/services/ingestion.py must define embed_chunks() (or a similarly
        named embedding service function) so the Celery task can call it
        rather than touching OpenAI directly.
        """
        src = _read_ingestion_source()
        tree = ast.parse(src)

        fn_names = [
            node.name for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]

        # Accept embed_chunks or embed_and_store_chunks as valid names
        embedding_fns = [n for n in fn_names if "embed" in n.lower()]
        assert embedding_fns, (
            "app/services/ingestion.py must define an embed_chunks() "
            "function so the Celery task can delegate embedding to Layer 2 "
            "(DESIGN.md §0 rule 8, §7 rule 1). Found functions: "
            + str(fn_names)
        )

    def test_embed_chunks_takes_chunks_list(self):
        """
        embed_chunks() in ingestion.py must accept a list of chunk dicts
        (the output of ingest_document) and return embeddings or augmented chunks.
        """
        src = _read_ingestion_source()
        tree = ast.parse(src)

        embed_fn = None
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if "embed" in node.name.lower():
                    embed_fn = node
                    break

        assert embed_fn is not None, (
            "No embed_* function found in app/services/ingestion.py"
        )

        # Must have at least one parameter (chunks)
        args = embed_fn.args
        all_args = [a.arg for a in args.args]
        assert len(all_args) >= 1, (
            f"embed_chunks() must accept at least one argument (the chunks list). "
            f"Got: {all_args}"
        )


class TestDirectDBWriteRemovedFromCeleryTask:
    """
    CRITICAL (DESIGN.md §0 rule 8):
    The Celery task must not write to the 'chunks' table directly.
    Chunk storage must be delegated to a service function in app/services/.
    """

    def test_celery_worker_does_not_write_chunks_table_directly(self):
        """
        celery_worker.py must not contain supabase.table("chunks").insert(...)
        The chunks storage must be delegated to a service function.
        """
        src = _read_celery_source()

        # Check for direct chunks table write
        has_direct_chunks_write = (
            '"chunks"' in src and "insert(" in src
            # More specific: both together in meaningful proximity
        )

        # Parse AST to find table("chunks").insert calls
        tree = ast.parse(src)
        direct_writes = []
        for node in ast.walk(tree):
            # Look for attribute chains: something.table("chunks").insert(...)
            if isinstance(node, ast.Call):
                # Check if this is an .insert() call on a .table("chunks") result
                func = node.func
                if isinstance(func, ast.Attribute) and func.attr == "insert":
                    # Check the object it's called on
                    val = func.value
                    if isinstance(val, ast.Call):
                        inner_func = val.func
                        if isinstance(inner_func, ast.Attribute) and inner_func.attr == "table":
                            # Check if argument is "chunks"
                            if val.args and isinstance(val.args[0], ast.Constant):
                                if val.args[0].value == "chunks":
                                    direct_writes.append(f"line {node.lineno}")

        assert direct_writes == [], (
            f"celery_worker.py must not call supabase.table('chunks').insert(...) directly "
            f"(DESIGN.md §0 rule 8). Found at: {direct_writes}. "
            f"Move chunk storage to a service function in app/services/ingestion.py."
        )

    def test_store_chunks_function_exists_in_ingestion_service(self):
        """
        app/services/ingestion.py must define a store_chunks() (or similar)
        function so the Celery task can delegate DB writes to Layer 2.
        """
        src = _read_ingestion_source()
        tree = ast.parse(src)

        fn_names = [
            node.name for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]

        storage_fns = [n for n in fn_names if "store" in n.lower() or "save" in n.lower() or "insert" in n.lower()]
        assert storage_fns, (
            "app/services/ingestion.py must define a store_chunks() "
            "function so the Celery task can delegate chunk storage to Layer 2 "
            "(DESIGN.md §0 rule 8). Found functions: " + str(fn_names)
        )


class TestCeleryTaskDelegatesToIngestionService:
    """
    CRITICAL (DESIGN.md §0 rule 8):
    The Celery task's process_document must import and call the embedding
    service function from app.services.ingestion rather than calling OpenAI directly.
    """

    def test_celery_worker_imports_embed_function_from_services(self):
        """
        celery_worker.py must import embed_chunks (or equivalent) from
        app.services.ingestion (or another service module).
        """
        src = _read_celery_source()
        tree = ast.parse(src)

        service_imports_with_embed = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module and "services" in node.module:
                    names = [a.name for a in node.names]
                    embed_names = [n for n in names if "embed" in n.lower() or "store" in n.lower()]
                    if embed_names:
                        service_imports_with_embed.extend(embed_names)

        assert service_imports_with_embed, (
            "celery_worker.py must import an embed/store function from "
            "app.services.* (DESIGN.md §0 rule 8, §7 rule 1). "
            "Currently it calls OpenAI directly instead of delegating to Layer 2."
        )


# ── BLOCKER 3: Error codes must come from error_codes registry ──────────────


class TestCeleryTaskUsesRegisteredErrorCodes:
    """
    MAJOR (DESIGN.md §3.1.2):
    The Celery task must use error codes from app/core/error_codes.py
    (EMBED_FAILED, PARSE_FAILED, CHUNK_FAILED, UPLOAD_FAILED, INTERNAL_ERROR).
    Must NOT use raw string literals like "PROCESSING_ERROR" or "UNEXPECTED_ERROR".
    """

    def test_celery_worker_does_not_use_processing_error_literal(self):
        """
        'PROCESSING_ERROR' is not in the §3.1.2 registry.
        celery_worker.py must not use this string as an error code.
        """
        src = _read_celery_source()
        assert '"PROCESSING_ERROR"' not in src and "'PROCESSING_ERROR'" not in src, (
            "celery_worker.py uses unregistered error code 'PROCESSING_ERROR' "
            "(DESIGN.md §3.1.2). Use registered codes: EMBED_FAILED, PARSE_FAILED, "
            "CHUNK_FAILED, UPLOAD_FAILED, or INTERNAL_ERROR from error_codes.py."
        )

    def test_celery_worker_does_not_use_unexpected_error_literal(self):
        """
        'UNEXPECTED_ERROR' is not in the §3.1.2 registry.
        celery_worker.py must not use this string as an error code.
        """
        src = _read_celery_source()
        assert '"UNEXPECTED_ERROR"' not in src and "'UNEXPECTED_ERROR'" not in src, (
            "celery_worker.py uses unregistered error code 'UNEXPECTED_ERROR' "
            "(DESIGN.md §3.1.2). Use INTERNAL_ERROR from error_codes.py."
        )

    def test_celery_worker_imports_error_codes_module(self):
        """
        celery_worker.py must import error codes from app.core.error_codes
        rather than using inline string literals for error codes.
        """
        src = _read_celery_source()
        tree = ast.parse(src)

        imports_error_codes = False
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module and "error_codes" in node.module:
                    imports_error_codes = True
                    break

        assert imports_error_codes, (
            "celery_worker.py must import from app.core.error_codes "
            "(DESIGN.md §3.1.2). Error codes must not be inline string literals."
        )


# ── Behavioural test: embed_chunks is called, not openai directly ────────────


class TestEmbedChunksBehavioural:
    """
    Behavioural test pinning BLOCKER 1:
    When process_document runs, it must call the service-layer embed function,
    not the openai client, to generate embeddings.
    """

    def test_process_document_calls_embed_chunks_service(self):
        """
        AST check: celery_worker.py must call an embed_* function imported from
        app.services.ingestion (or another services module), not call
        embeddings.create on a locally-held OpenAI client.
        This is a structural check on the source AST.
        """
        celery_src = _read_celery_source()
        ingestion_src = _read_ingestion_source()

        # Confirm ingestion.py defines an embed_* function (structural requirement)
        i_tree = ast.parse(ingestion_src)
        i_fns = [n.name for n in ast.walk(i_tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        embed_fns = [f for f in i_fns if "embed" in f.lower()]
        assert embed_fns, (
            "app/services/ingestion.py must define an embed_*() function so the "
            "Celery task can delegate embedding to Layer 2 (DESIGN.md §7 rule 1). "
            f"Defined functions: {i_fns}"
        )

        # Confirm celery_worker.py calls that function (not embeddings.create directly)
        c_tree = ast.parse(celery_src)
        # Check that a call to one of the embed_fns appears in celery_worker
        call_names = []
        for node in ast.walk(c_tree):
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Name) and func.id in embed_fns:
                    call_names.append(func.id)
                elif isinstance(func, ast.Attribute) and func.attr in embed_fns:
                    call_names.append(func.attr)
        assert call_names, (
            f"celery_worker.py does not call any of {embed_fns}. "
            "The task must delegate embedding to the service layer (DESIGN.md §0 rule 8)."
        )
