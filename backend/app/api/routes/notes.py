"""Notes generation — structured study guide for a topic."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.services.retrieval import hybrid_search
from app.services.notes_gen import generate_notes

router = APIRouter(prefix="/notes", tags=["notes"])


class NotesRequest(BaseModel):
    topic: str
    file_id: Optional[str] = None
    outside_sources: bool = False


@router.post("/generate")
async def generate_notes_endpoint(req: NotesRequest):
    chunks = []
    if req.file_id:
        chunks = hybrid_search(topic=req.topic, file_id=req.file_id, top_k=15)

    notes = generate_notes(
        topic=req.topic,
        chunks=chunks,
        outside_sources=req.outside_sources,
    )

    return notes
