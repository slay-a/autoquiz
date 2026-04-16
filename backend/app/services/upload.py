"""
Upload service — handles file storage and job creation.
Routes delegate to this service per DESIGN.md layer separation.
"""

import uuid
from app.core.supabase import get_supabase
from app.models.schemas import JobStatus


# Domain exceptions (DESIGN.md Layer 2 compliance — no FastAPI imports)
class JobNotFoundError(Exception):
    """Raised when a job cannot be found."""
    pass


class AccessDeniedError(Exception):
    """Raised when a user attempts to access a job they don't own."""
    pass


class InvalidJobStateError(Exception):
    """Raised when a job operation is invalid for the current state."""
    pass


def store_file_and_create_job(
    file_contents: bytes,
    filename: str,
    content_type: str,
    uploaded_by: str,
    class_id: str = None,
) -> dict:
    """
    Store file in Supabase Storage, insert into uploaded_files and processing_jobs.

    Args:
        file_contents: Raw file bytes
        filename: Original filename
        content_type: MIME type
        uploaded_by: User ID from JWT
        class_id: Optional class ID to associate the file with

    Returns:
        dict with file_id, job_id, status, message
    """
    file_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    supabase = get_supabase()

    # Upload to Supabase Storage
    supabase.storage.from_("uploads").upload(
        path=f"{file_id}/{filename}",
        file=file_contents,
        file_options={"content-type": content_type},
    )

    # Insert into uploaded_files (GAP 1)
    file_record = {
        "file_id": file_id,
        "filename": filename,
        "uploaded_by": uploaded_by,
    }
    if class_id:
        file_record["class_id"] = class_id

    supabase.table("uploaded_files").insert(file_record).execute()

    # Insert into processing_jobs
    supabase.table("processing_jobs").insert({
        "job_id": job_id,
        "file_id": file_id,
        "filename": filename,
        "status": JobStatus.queued,
        "stage": "upload",
        "uploaded_by": uploaded_by,
    }).execute()

    return {
        "file_id": file_id,
        "job_id": job_id,
        "status": JobStatus.queued,
        "message": "File uploaded. Processing queued.",
    }


def get_job_status(job_id: str, user_id: str) -> dict:
    """
    Retrieve job status for a given job_id, enforcing ownership.

    Args:
        job_id: Processing job UUID
        user_id: User ID from JWT

    Returns:
        dict with job status data

    Raises:
        JobNotFoundError if job not found
        AccessDeniedError if job belongs to another user
    """
    supabase = get_supabase()
    result = supabase.table("processing_jobs").select("*").eq("job_id", job_id).single().execute()

    if not result.data:
        raise JobNotFoundError("Job not found")

    # Verify ownership
    if result.data.get("uploaded_by") != user_id:
        raise AccessDeniedError("Access denied: job belongs to another user")

    return result.data


def create_retry_job(job_id: str, user_id: str) -> dict:
    """
    Create a new retry job for a failed job, enforcing ownership.

    Args:
        job_id: Failed job UUID
        user_id: User ID from JWT

    Returns:
        dict with new file_id, job_id, status, message

    Raises:
        JobNotFoundError if job not found
        AccessDeniedError if job belongs to another user
        InvalidJobStateError if job status is not 'failed'
    """
    supabase = get_supabase()
    result = supabase.table("processing_jobs").select("*").eq("job_id", job_id).single().execute()

    if not result.data:
        raise JobNotFoundError("Job not found")

    job = result.data

    # Verify ownership
    if job.get("uploaded_by") != user_id:
        raise AccessDeniedError("Access denied: job belongs to another user")

    if job["status"] != "failed":
        raise InvalidJobStateError("Only failed jobs can be retried")

    # Create new job with same file_id and user
    new_job_id = str(uuid.uuid4())
    supabase.table("processing_jobs").insert({
        "job_id": new_job_id,
        "file_id": job["file_id"],
        "filename": job["filename"],
        "status": JobStatus.queued,
        "stage": "upload",
        "uploaded_by": user_id,
    }).execute()

    return {
        "file_id": job["file_id"],
        "job_id": new_job_id,
        "status": JobStatus.queued,
        "message": "Retry queued.",
        "filename": job["filename"],
    }


def get_user_files(user_id: str) -> list[dict]:
    """
    Retrieve all successfully processed files for a user.

    Args:
        user_id: User ID from JWT

    Returns:
        list of dicts with file_id, filename, created_at
    """
    supabase = get_supabase()
    # Query processing_jobs directly — it stores file_id, filename, uploaded_by, and status,
    # so no join to uploaded_files is needed. processing_jobs.file_id has no FK constraint,
    # making PostgREST !inner joins from uploaded_files unreliable.
    result = (
        supabase.table("processing_jobs")
        .select("file_id, filename, created_at")
        .eq("uploaded_by", user_id)
        .eq("status", "success")
        .order("created_at", desc=True)
        .execute()
    )

    return result.data or []
