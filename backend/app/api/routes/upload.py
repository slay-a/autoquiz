"""E1 — File upload and processing status endpoints."""

import uuid
from fastapi import APIRouter, UploadFile, File, Form, Depends
from fastapi.responses import JSONResponse
from typing import Optional
from app.core.config import settings
from app.models.schemas import UploadResponse, JobStatusResponse, UserFileEntry
from app.api.dependencies import get_current_user
from app.services.upload import (
    store_file_and_create_job,
    get_job_status,
    create_retry_job,
    get_user_files,
    JobNotFoundError,
    AccessDeniedError,
    InvalidJobStateError,
)
from app.core.error_codes import (
    UNSUPPORTED_FILE_TYPE,
    UPLOAD_TOO_LARGE,
    JOB_NOT_FOUND,
    ROLE_FORBIDDEN,
    INVALID_JOB_STATE,
    INTERNAL_ERROR,
)
from celery_worker import process_document
from app.core.logging import log_event

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx"}
MAX_BYTES = settings.max_upload_size_mb * 1024 * 1024
CHUNK_SIZE = 1024 * 1024  # 1MB chunks for size validation


def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "request_id": str(uuid.uuid4())}},
    )


@router.post("/", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    class_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        log_event(
            "upload.file.rejected",
            level="WARNING",
            outcome="failure",
            actor_id=current_user.get("id"),
            actor_role=current_user.get("role"),
            resource_type="file",
            meta={"reason": "ext", "size_bytes": 0},
        )
        return _err(400, UNSUPPORTED_FILE_TYPE, f"Unsupported file type: {ext}. Allowed: {ALLOWED_EXTENSIONS}")

    contents = bytearray()
    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break
        contents.extend(chunk)
        if len(contents) > MAX_BYTES:
            log_event(
                "upload.file.rejected",
                level="WARNING",
                outcome="failure",
                actor_id=current_user.get("id"),
                actor_role=current_user.get("role"),
                resource_type="file",
                meta={"reason": "size", "size_bytes": len(contents)},
            )
            return _err(413, UPLOAD_TOO_LARGE, f"File exceeds {settings.max_upload_size_mb}MB limit")

    result = store_file_and_create_job(
        file_contents=bytes(contents),
        filename=file.filename,
        content_type=file.content_type or "application/octet-stream",
        uploaded_by=current_user["id"],
        class_id=class_id,
    )

    log_event(
        "upload.file.accepted",
        level="INFO",
        outcome="success",
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        resource_type="file",
        resource_id=result["file_id"],
        meta={"mime_type": file.content_type or "application/octet-stream", "size_bytes": len(contents)},
    )

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
    try:
        result = get_job_status(job_id, current_user["id"])
        return JobStatusResponse(**result)
    except JobNotFoundError:
        return _err(404, JOB_NOT_FOUND, "Job not found.")
    except AccessDeniedError:
        return _err(403, ROLE_FORBIDDEN, "You do not have access to this job.")


@router.post("/retry/{job_id}", response_model=UploadResponse)
async def retry_job_endpoint(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        result = create_retry_job(job_id, current_user["id"])

        process_document.delay(
            file_id=result["file_id"],
            job_id=result["job_id"],
            filename=result["filename"],
        )

        return UploadResponse(**result)
    except JobNotFoundError:
        return _err(404, JOB_NOT_FOUND, "Job not found.")
    except AccessDeniedError:
        return _err(403, ROLE_FORBIDDEN, "You do not have access to this job.")
    except InvalidJobStateError:
        return _err(400, INVALID_JOB_STATE, "Only failed jobs can be retried.")


@router.get("/files", response_model=list[UserFileEntry])
async def get_user_files_endpoint(
    current_user: dict = Depends(get_current_user),
):
    """Retrieve all successfully processed files for the current user."""
    files = get_user_files(current_user["id"])
    return files
