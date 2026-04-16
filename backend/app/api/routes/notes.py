"""Notes generation — structured study guide for a topic."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.retrieval import hybrid_search
from app.services.notes_gen import generate_notes
from app.api.dependencies import get_current_user
from app.core.supabase import get_supabase
from app.models.schemas import NotesSaveRequest, NotesSaveResponse

router = APIRouter(prefix="/notes", tags=["notes"])


class NotesRequest(BaseModel):
    topic: str
    file_id: Optional[str] = None
    outside_sources: bool = False


@router.post("/generate")
async def generate_notes_endpoint(req: NotesRequest, current_user: dict = Depends(get_current_user)):
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
async def save_notes_endpoint(req: NotesSaveRequest, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()

    result = supabase.table("student_notes").insert({
        "title": req.topic,
        "topic": req.topic,
        "file_id": req.file_id,
        "created_by": current_user["id"],
        "content": req.content,
    }).execute()

    if not result.data:
        raise HTTPException(500, "Failed to save notes")

    row = result.data[0]
    return NotesSaveResponse(
        id=str(row["id"]),
        title=row["title"],
        topic=row["topic"],
        created_at=row["created_at"],
    )


@router.get("/my")
async def get_my_notes_endpoint(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()

    result = supabase.table("student_notes").select("id, title, topic, created_at").eq("created_by", current_user["id"]).order("created_at", desc=True).execute()

    return result.data if result.data else []


@router.get("/{id}")
async def get_note_endpoint(id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()

    result = supabase.table("student_notes").select("*").eq("id", id).execute()

    if not result.data:
        raise HTTPException(404, "Note not found")

    row = result.data[0]

    if row["created_by"] != current_user["id"]:
        raise HTTPException(403, "You do not have access to this note")

    return row
