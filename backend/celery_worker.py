"""
Celery async worker for document processing.
Handles: extract → clean → section → chunk → embed → store
"""

from celery import Celery
from app.core.config import settings
from app.core.supabase import get_supabase
from app.core.error_codes import (
    EMBED_FAILED,
    CHUNK_FAILED,
    PARSE_FAILED,
    INTERNAL_ERROR,
)
from app.models.schemas import JobStatus
from app.services.ingestion import ingest_document, embed_chunks, store_chunks

celery_app = Celery("autoquiz", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"


def _update_job(job_id: str, status: JobStatus, stage: str, error_code: str = None, error_message: str = None):
    supabase = get_supabase()
    payload = {"status": status, "stage": stage}
    if error_code:
        payload["error_code"] = error_code
    if error_message:
        payload["error_message"] = error_message
    supabase.table("processing_jobs").update(payload).eq("job_id", job_id).execute()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def process_document(self, file_id: str, job_id: str, filename: str):
    supabase = get_supabase()

    try:
        # Stage 1: Extract
        _update_job(job_id, JobStatus.in_progress, "extract")

        # Download file from Supabase Storage
        file_bytes = supabase.storage.from_("uploads").download(f"{file_id}/{filename}")

        # Stage 2: Clean (handled internally by LlamaIndex parsers)
        _update_job(job_id, JobStatus.in_progress, "clean")

        # Stage 3: Section (handled internally by LlamaIndex SentenceSplitter)
        _update_job(job_id, JobStatus.in_progress, "section")

        # Parse → clean → section → chunk (LlamaIndex handles internally)
        chunks = ingest_document(file_bytes, filename, file_id)

        # Stage 4: Chunk
        _update_job(job_id, JobStatus.in_progress, "chunk")

        # Embed all chunks — delegated to Layer 2 service (DESIGN.md §7 rule 1)
        chunks_with_embeddings = embed_chunks(chunks)

        # Store chunks + embeddings — delegated to Layer 2 service (DESIGN.md §0 rule 8)
        store_chunks(chunks_with_embeddings)

        _update_job(job_id, JobStatus.success, "chunk")

    except ValueError as e:
        # Format: "stage|message"
        parts = str(e).split("|", 1)
        stage = parts[0] if len(parts) == 2 else "unknown"
        message = parts[1] if len(parts) == 2 else str(e)

        # Map stage to registered error code (DESIGN.md §3.1.2)
        _STAGE_TO_ERROR_CODE = {
            "extract": PARSE_FAILED,
            "chunk": CHUNK_FAILED,
            "embed": EMBED_FAILED,
        }
        error_code = _STAGE_TO_ERROR_CODE.get(stage, INTERNAL_ERROR)

        try:
            # Retry transient failures
            self.retry(exc=e)
        except self.MaxRetriesExceededError:
            _update_job(job_id, JobStatus.failed, stage, error_code=error_code, error_message=message)

    except Exception as e:
        try:
            self.retry(exc=e)
        except self.MaxRetriesExceededError:
            _update_job(job_id, JobStatus.failed, "unknown", error_code=INTERNAL_ERROR, error_message=str(e))
