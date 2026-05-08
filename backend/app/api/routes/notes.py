"""
Notes generation — structured study guide for a topic.

Layer 1 (API / Presentation) — no direct DB or OpenAI calls.
All persistence is delegated to app.services.notes_service (Layer 2).
All LLM work is delegated to app.services.notes_gen (Layer 2).
"""

import uuid
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from app.services.retrieval import hybrid_search
from app.services.notes_gen import generate_notes
from app.services.notes_service import save_student_note, get_student_note, list_student_notes
from app.api.dependencies import get_current_user
from app.api.rate_limit import enforce_llm_rate_limit
from app.core.logging import log_event
from app.core.exceptions import NoteNotFoundError, NoteOwnershipError
from app.core.error_codes import NOTE_NOT_FOUND, ROLE_FORBIDDEN, NOTES_SAVE_FAILED, INTERNAL_ERROR
from app.models.schemas import NotesSaveRequest, NotesSaveResponse

router = APIRouter(prefix="/notes", tags=["notes"])


def _error_response(status_code: int, code: str, message: str, request: Request) -> JSONResponse:
    """Build a standard error envelope per DESIGN.md §3.1.1."""
    request_id = getattr(getattr(request, "state", None), "request_id", None) or str(uuid.uuid4())
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": str(request_id),
            }
        },
    )


class NotesRequest(BaseModel):
    topic: str
    file_id: Optional[str] = None
    outside_sources: bool = False


@router.post("/generate")
async def generate_notes_endpoint(
    req: NotesRequest,
    request: Request,
    current_user: dict = Depends(enforce_llm_rate_limit),
):
    """
    Generate structured study notes for a topic.

    AC-9.1.2: Protected by get_current_user — unauthenticated requests → 401.
    AC-9.1.3: When file_id provided, retrieves top-15 chunks via hybrid_search.
    AC-9.1.4: Response contains summary, key_concepts, important_details, common_misconceptions.
    AC-9.1.5: When no file_id, outside_sources defaults true, no retrieval performed.
    """
    chunks = []
    if req.file_id:
        chunks = hybrid_search(topic=req.topic, file_id=req.file_id, top_k=15)

    notes = generate_notes(
        topic=req.topic,
        chunks=chunks,
        outside_sources=req.outside_sources,
    )

    return notes


@router.post("/save", response_model=NotesSaveResponse)
async def save_notes_endpoint(
    req: NotesSaveRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Save generated notes to student_notes.

    AC-9.2.1: Inserts into student_notes with title, topic, file_id, created_by, content.
    AC-9.2.2: created_by is always from JWT (current_user["id"]) — never from client body.

    Layer boundary: all DB work delegated to notes_service (Layer 2).
    """
    try:
        row = save_student_note(
            topic=req.topic,
            file_id=req.file_id,
            content=req.content,
            created_by=current_user["id"],
        )
    except RuntimeError:
        log_event(
            "notes.save.failed",
            level="ERROR",
            outcome="failure",
            actor_id=current_user.get("id"),
            actor_role=current_user.get("role"),
            resource_type="note",
            request_id=str(getattr(getattr(request, "state", None), "request_id", "") or ""),
            error_code=NOTES_SAVE_FAILED,
        )
        return _error_response(500, NOTES_SAVE_FAILED, "Failed to save notes.", request)

    note_id = str(row["id"])

    log_event(
        "notes.save.completed",
        level="INFO",
        outcome="success",
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        resource_type="note",
        resource_id=note_id,
        request_id=str(getattr(getattr(request, "state", None), "request_id", "") or ""),
    )

    return NotesSaveResponse(
        id=note_id,
        title=row["title"],
        topic=row["topic"],
        created_at=row["created_at"],
    )


@router.get("/my")
async def get_my_notes_endpoint(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Return the authenticated student's saved notes, newest-first.

    Layer boundary: all DB work delegated to notes_service (Layer 2).
    """
    return list_student_notes(user_id=current_user["id"])


@router.get("/{id}")
async def get_note_endpoint(
    id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Fetch a student_notes row by ID.

    Returns 404 if not found; 403 if owned by a different user.
    Layer boundary: all DB work delegated to notes_service (Layer 2).
    """
    try:
        return get_student_note(note_id=id, requesting_user_id=current_user["id"])
    except NoteNotFoundError:
        return _error_response(404, NOTE_NOT_FOUND, "Note not found.", request)
    except NoteOwnershipError:
        return _error_response(403, ROLE_FORBIDDEN, "You do not have access to this note.", request)
