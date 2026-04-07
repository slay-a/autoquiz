"""E3 — Quiz generation endpoint."""

import uuid
from fastapi import APIRouter, HTTPException
from app.models.schemas import QuizRequest, QuizResponse
from app.services.retrieval import hybrid_search
from app.services.quiz_gen import generate_quiz

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz_endpoint(request: QuizRequest):
    if not request.topic.strip():
        raise HTTPException(400, "Topic cannot be empty")

    # Retrieve relevant chunks first
    chunks = hybrid_search(
        topic=request.topic,
        file_id=request.file_id,
        top_k=10,
    )

    if not chunks:
        raise HTTPException(404, f"No content found for topic: '{request.topic}'")

    questions = generate_quiz(
        topic=request.topic,
        chunks=chunks,
        num_questions=request.num_questions,
        difficulty=request.difficulty,
        question_types=request.question_types,
    )

    return QuizResponse(
        quiz_id=str(uuid.uuid4()),
        topic=request.topic,
        difficulty=request.difficulty,
        questions=questions,
    )
