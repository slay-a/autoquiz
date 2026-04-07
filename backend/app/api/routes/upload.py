"""E1 — File upload and processing status endpoints."""

import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.core.config import settings
from app.core.supabase import get_supabase
from app.models.schemas import UploadResponse, JobStatusResponse, JobStatus

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx"}
MAX_BYTES = settings.max_upload_size_mb * 1024 * 1024


@router.post("/", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    # Validate extension
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {ALLOWED_EXTENSIONS}")

    # Read and validate size
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(413, f"File exceeds {settings.max_upload_size_mb}MB limit")

    file_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    supabase = get_supabase()

    # Upload raw file to Supabase Storage
    supabase.storage.from_("uploads").upload(
        path=f"{file_id}/{file.filename}",
        file=contents,
        file_options={"content-type": file.content_type},
    )

    # Create job record
    supabase.table("processing_jobs").insert({
        "job_id": job_id,
        "file_id": file_id,
        "filename": file.filename,
        "status": JobStatus.queued,
        "stage": "upload",
    }).execute()

    # Dispatch async Celery task
    from celery_worker import process_document
    process_document.delay(file_id=file_id, job_id=job_id, filename=file.filename)

    return UploadResponse(
        file_id=file_id,
        job_id=job_id,
        status=JobStatus.queued,
        message="File uploaded. Processing queued.",
    )


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    supabase = get_supabase()
    result = supabase.table("processing_jobs").select("*").eq("job_id", job_id).single().execute()

    if not result.data:
        raise HTTPException(404, "Job not found")

    return JobStatusResponse(**result.data)


@router.post("/retry/{job_id}", response_model=UploadResponse)
async def retry_job(job_id: str):
    supabase = get_supabase()
    result = supabase.table("processing_jobs").select("*").eq("job_id", job_id).single().execute()

    if not result.data:
        raise HTTPException(404, "Job not found")

    job = result.data
    if job["status"] != JobStatus.failed:
        raise HTTPException(400, "Only failed jobs can be retried")

    new_job_id = str(uuid.uuid4())
    supabase.table("processing_jobs").insert({
        "job_id": new_job_id,
        "file_id": job["file_id"],
        "filename": job["filename"],
        "status": JobStatus.queued,
        "stage": "upload",
    }).execute()

    from celery_worker import process_document
    process_document.delay(file_id=job["file_id"], job_id=new_job_id, filename=job["filename"])

    return UploadResponse(
        file_id=job["file_id"],
        job_id=new_job_id,
        status=JobStatus.queued,
        message="Retry queued.",
    )
