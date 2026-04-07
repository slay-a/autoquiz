"""E2 — Topic search and retrieval endpoints."""

from fastapi import APIRouter, HTTPException
from app.models.schemas import RetrieveRequest, RetrieveResponse, ChunkResult
from app.services.retrieval import hybrid_search

router = APIRouter(prefix="/retrieve", tags=["retrieve"])


@router.post("/", response_model=RetrieveResponse)
async def retrieve_chunks(request: RetrieveRequest):
    if not request.topic.strip():
        raise HTTPException(400, "Topic cannot be empty")

    results = hybrid_search(
        topic=request.topic,
        file_id=request.file_id,
        top_k=request.top_k,
    )

    chunks = [
        ChunkResult(
            chunk_id=r["chunk_id"],
            file_id=r["file_id"],
            text=r["text"],
            score=round(r["score"], 4),
            page_numbers=r.get("page_numbers") or [],
            section_title=r.get("section_title"),
        )
        for r in results
    ]

    return RetrieveResponse(topic=request.topic, results=chunks)
