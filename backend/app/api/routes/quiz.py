"""E3 — Quiz generation endpoint."""

import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.models.schemas import QuizResponse
from app.services.retrieval import hybrid_search
from app.services.quiz_gen import generate_quiz

router = APIRouter(prefix="/quiz", tags=["quiz"])


class QuizRequest(BaseModel):
    topic: str
    file_id: Optional[str] = None
    num_questions: int = 5
    difficulty: str = "medium"
    question_types: list[str] = ["mcq", "true_false", "short_answer"]
    outside_sources: bool = False


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz_endpoint(request: QuizRequest):
    if not request.topic.strip():
        raise HTTPException(400, "Topic cannot be empty")

    # Retrieve relevant chunks if a file is provided
    chunks = []
    if request.file_id:
        chunks = hybrid_search(
            topic=request.topic,
            file_id=request.file_id,
            top_k=12,
        )
        if not chunks and not request.outside_sources:
            raise HTTPException(404, f"Could not find content for '{request.topic}' in the uploaded file. Make sure the file uploaded successfully, or enable 'Outside sources' to use general knowledge.")

    questions = generate_quiz(
        topic=request.topic,
        chunks=chunks,
        num_questions=request.num_questions,
        difficulty=request.difficulty,
        question_types=request.question_types,
        outside_sources=request.outside_sources,
    )

    return QuizResponse(
        quiz_id=str(uuid.uuid4()),
        topic=request.topic,
        difficulty=request.difficulty,
        questions=questions,
    )
