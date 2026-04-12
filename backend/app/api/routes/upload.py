"""E1 — File upload and processing status endpoints."""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.core.config import settings
from app.models.schemas import UploadResponse, JobStatusResponse
from app.api.dependencies import get_current_user
from app.services.upload import (
    store_file_and_create_job,
    get_job_status,
    create_retry_job,
    JobNotFoundError,
    AccessDeniedError,
    InvalidJobStateError,
)

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx"}
MAX_BYTES = settings.max_upload_size_mb * 1024 * 1024
CHUNK_SIZE = 1024 * 1024  # 1MB chunks for size validation


@router.post("/", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    # Validate extension
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {ALLOWED_EXTENSIONS}")

    # Read file in chunks and validate size (GAP 4)
    contents = bytearray()
    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break
        contents.extend(chunk)
        if len(contents) > MAX_BYTES:
            raise HTTPException(413, f"File exceeds {settings.max_upload_size_mb}MB limit")

    # Delegate to service (GAP 6)
    result = store_file_and_create_job(
        file_contents=bytes(contents),
        filename=file.filename,
        content_type=file.content_type or "application/octet-stream",
        uploaded_by=current_user["id"],
    )

    # Dispatch async Celery task
    from celery_worker import process_document
    process_document.delay(
        file_id=result["file_id"],
        job_id=result["job_id"],
        filename=file.filename,
    )

    return UploadResponse(**result)


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status_endpoint(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    # Delegate to service and translate domain exceptions to HTTP responses
    try:
        result = get_job_status(job_id, current_user["id"])
        return JobStatusResponse(**result)
    except JobNotFoundError as e:
        raise HTTPException(404, str(e))
    except AccessDeniedError as e:
        raise HTTPException(403, str(e))


@router.post("/retry/{job_id}", response_model=UploadResponse)
async def retry_job_endpoint(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    # Delegate to service and translate domain exceptions to HTTP responses
    try:
        result = create_retry_job(job_id, current_user["id"])

        # Dispatch async Celery task
        from celery_worker import process_document
        process_document.delay(
            file_id=result["file_id"],
            job_id=result["job_id"],
            filename=result["filename"],
        )

        return UploadResponse(**result)
    except JobNotFoundError as e:
        raise HTTPException(404, str(e))
    except AccessDeniedError as e:
        raise HTTPException(403, str(e))
    except InvalidJobStateError as e:
        raise HTTPException(400, str(e))
