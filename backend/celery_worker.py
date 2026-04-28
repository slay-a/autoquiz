"""
Celery async worker for document processing.
Handles: extract → clean → section → chunk → embed → store

Layer compliance (DESIGN.md §0 rule 8):
- Job-status writes go through app.services.upload.update_job_status.
- File download goes through app.services.upload.download_file_bytes.
- No direct get_supabase() calls in task bodies or helpers.

Structured logging (DESIGN.md §14.3):
- Emits ingestion.job.started, ingestion.job.completed, ingestion.job.failed
  via app.core.logging.log_event.
"""

import time
from celery import Celery
from app.core.config import settings
from app.core.logging import log_event
from app.core.error_codes import (
    EMBED_FAILED,
    CHUNK_FAILED,
    PARSE_FAILED,
    INTERNAL_ERROR,
)
from app.core.exceptions import (
    UnsupportedFileTypeError,
    ParseError,
    EmbeddingError,
    IngestionError,
    StorageError,
)
from app.models.schemas import JobStatus
from app.services.ingestion import ingest_document, embed_chunks, store_chunks
from app.services.upload import update_job_status, download_file_bytes

celery_app = Celery("autoquiz", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"


@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def process_document(self, file_id: str, job_id: str, filename: str):
    """
    Full document ingestion pipeline task.

    Stages: extract → chunk → embed → store
    On success: sets job status to 'success'.
    On typed IngestionError / StorageError: maps to registered error code, marks job failed.
    On unexpected exception: marks job failed with INTERNAL_ERROR.
    """
    start_ms = int(time.time() * 1000)

    log_event(
        event="ingestion.job.started",
        level="INFO",
        outcome="success",
        resource_type="job",
        resource_id=job_id,
        meta={"file_id": file_id, "stage": "extract"},
    )

    try:
        # Stage 1: Extract — download via service layer
        update_job_status(job_id, JobStatus.in_progress, "extract")
        file_bytes = download_file_bytes(file_id, filename)

        # Stage 2: Clean (handled internally by LlamaIndex parsers)
        update_job_status(job_id, JobStatus.in_progress, "clean")

        # Stage 3: Section (handled internally by LlamaIndex SentenceSplitter)
        update_job_status(job_id, JobStatus.in_progress, "section")

        # Parse → clean → section → chunk
        chunks = ingest_document(file_bytes, filename, file_id)

        # Stage 4: Chunk
        update_job_status(job_id, JobStatus.in_progress, "chunk")

        # Embed all chunks
        chunks_with_embeddings = embed_chunks(chunks)

        # Store chunks + embeddings
        store_chunks(chunks_with_embeddings)

        update_job_status(job_id, JobStatus.success, "chunk")

        duration_ms = int(time.time() * 1000) - start_ms
        log_event(
            event="ingestion.job.completed",
            level="INFO",
            outcome="success",
            resource_type="job",
            resource_id=job_id,
            duration_ms=duration_ms,
            meta={
                "file_id": file_id,
                "chunk_count": len(chunks),
                "stages_run": ["extract", "clean", "section", "chunk", "embed", "store"],
            },
        )

    except StorageError as e:
        _handle_ingestion_failure(
            self, job_id, file_id, stage="extract",
            error_code=PARSE_FAILED, exc=e, start_ms=start_ms,
        )

    except (UnsupportedFileTypeError, ParseError) as e:
        _handle_ingestion_failure(
            self, job_id, file_id, stage="extract",
            error_code=PARSE_FAILED, exc=e, start_ms=start_ms,
        )

    except EmbeddingError as e:
        _handle_ingestion_failure(
            self, job_id, file_id, stage="chunk",
            error_code=EMBED_FAILED, exc=e, start_ms=start_ms,
        )

    except IngestionError as e:
        error_code = e.error_code if e.error_code else CHUNK_FAILED
        _handle_ingestion_failure(
            self, job_id, file_id, stage="chunk",
            error_code=error_code, exc=e, start_ms=start_ms,
        )

    except Exception as e:
        _handle_ingestion_failure(
            self, job_id, file_id, stage="unknown",
            error_code=INTERNAL_ERROR, exc=e, start_ms=start_ms,
        )


def _handle_ingestion_failure(
    task, job_id: str, file_id: str, stage: str,
    error_code: str, exc: Exception, start_ms: int,
) -> None:
    """
    Attempt Celery retry; on max-retries-exceeded, mark job failed and emit
    the ingestion.job.failed log event.
    """
    try:
        task.retry(exc=exc)
    except task.MaxRetriesExceededError:
        duration_ms = int(time.time() * 1000) - start_ms
        update_job_status(
            job_id,
            JobStatus.failed,
            stage,
            error_code=error_code,
            error_message=str(exc),
        )
        log_event(
            event="ingestion.job.failed",
            level="ERROR",
            outcome="failure",
            resource_type="job",
            resource_id=job_id,
            duration_ms=duration_ms,
            error_code=error_code,
            meta={
                "file_id": file_id,
                "stage": stage,
                "exception_type": type(exc).__name__,
            },
        )
