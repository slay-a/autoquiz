"""
Celery async worker for document processing.
Handles: extract → clean → section → chunk → embed → store
"""

from celery import Celery
from app.core.config import settings
from app.core.supabase import get_supabase
from app.models.schemas import JobStatus
from app.services.ingestion import ingest_document
from openai import OpenAI

celery_app = Celery("autoquiz", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"

_openai = OpenAI(api_key=settings.openai_api_key)


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
        _update_job(job_id, JobStatus.in_progress, "extract")

        # Download file from Supabase Storage
        file_bytes = supabase.storage.from_("uploads").download(f"{file_id}/{filename}")

        # Parse → clean → section → chunk
        chunks = ingest_document(file_bytes, filename, file_id)

        # Embed all chunks
        _update_job(job_id, JobStatus.in_progress, "chunk")
        texts = [c["text"] for c in chunks]
        embed_response = _openai.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        embeddings = [e.embedding for e in embed_response.data]

        # Store chunks + embeddings in Supabase
        rows = [
            {
                "chunk_id": chunks[i]["chunk_id"],
                "file_id": chunks[i]["file_id"],
                "section_id": chunks[i]["section_id"],
                "section_title": chunks[i]["section_title"],
                "page_numbers": chunks[i]["page_numbers"],
                "text": chunks[i]["text"],
                "embedding": embeddings[i],
            }
            for i in range(len(chunks))
        ]
        supabase.table("chunks").insert(rows).execute()

        _update_job(job_id, JobStatus.success, "chunk")

    except ValueError as e:
        # Format: "stage|message"
        parts = str(e).split("|", 1)
        stage = parts[0] if len(parts) == 2 else "unknown"
        message = parts[1] if len(parts) == 2 else str(e)

        try:
            # Retry transient failures
            self.retry(exc=e)
        except self.MaxRetriesExceededError:
            _update_job(job_id, JobStatus.failed, stage, error_code="PROCESSING_ERROR", error_message=message)

    except Exception as e:
        try:
            self.retry(exc=e)
        except self.MaxRetriesExceededError:
            _update_job(job_id, JobStatus.failed, "unknown", error_code="UNEXPECTED_ERROR", error_message=str(e))
