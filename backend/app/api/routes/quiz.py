"""E3 — Quiz generation endpoint."""

import uuid
from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import QuizResponse, QuizRequest
from app.services.retrieval import hybrid_search
from app.services.quiz_gen import generate_quiz
from app.api.dependencies import get_current_user
from app.core.supabase import get_supabase

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz_endpoint(
    request: QuizRequest,
    current_user: dict = Depends(get_current_user),
):
    if not request.topic.strip():
        raise HTTPException(400, "Topic cannot be empty")

    # Retrieve relevant chunks if a file is provided
    chunks = []
    if request.file_id:
        # Validate file_id ownership
        supabase = get_supabase()
        file_row = supabase.table("uploaded_files").select("uploaded_by").eq("file_id", request.file_id).execute()

        if not file_row.data:
            raise HTTPException(404, "File not found")

        if file_row.data[0]["uploaded_by"] != current_user["id"]:
            raise HTTPException(403, "You do not have access to this file")

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
        num_questions=request.num_questions,
        questions=questions,
    )


@router.get("/my", tags=["quiz"])
def get_my_quizzes(current_user: dict = Depends(get_current_user)):
    """
    Return saved quizzes for the authenticated student.
    Filters by created_by = current_user["id"], ordered newest-first.
    """
    supabase = get_supabase()
    result = (
        supabase.table("saved_quizzes")
        .select("*")
        .eq("created_by", current_user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []
