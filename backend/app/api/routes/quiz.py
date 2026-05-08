"""Quiz routes — generation, save, load, and listing."""

import uuid
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from app.models.schemas import QuizResponse, QuizRequest, SaveQuizRequest
from app.services.retrieval import hybrid_search
from app.services.quiz_gen import generate_quiz
from app.services.quiz_service import (
    check_file_ownership,
    get_quiz_by_id,
    save_quiz,
    get_my_quizzes as svc_get_my_quizzes,
    QuizNotFoundError,
)
from app.core.exceptions import JobNotFoundError, AccessDeniedError
from app.api.dependencies import get_current_user
from app.api.rate_limit import enforce_llm_rate_limit
from app.core.logging import log_event
from app.core.error_codes import (
    EMPTY_TOPIC, FILE_NOT_FOUND, ROLE_FORBIDDEN, NO_CONTENT_FOUND,
    QUIZ_NOT_FOUND, INTERNAL_ERROR,
)

router = APIRouter(prefix="/quiz", tags=["quiz"])


def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "request_id": str(uuid.uuid4())}},
    )


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz_endpoint(
    request: QuizRequest,
    current_user: dict = Depends(enforce_llm_rate_limit),
):
    # Role guard: quiz generation is student-only (spec §3, DESIGN.md §4)
    if current_user.get("role") == "instructor":
        return _err(
            403,
            ROLE_FORBIDDEN,
            "Quiz generation is not available for instructor accounts.",
        )

    if not request.topic.strip():
        return _err(400, EMPTY_TOPIC, "Topic cannot be empty.")

    chunks = []
    if request.file_id:
        try:
            check_file_ownership(request.file_id, current_user["id"])
        except JobNotFoundError:
            return _err(404, FILE_NOT_FOUND, "File not found.")
        except AccessDeniedError:
            return _err(403, ROLE_FORBIDDEN, "You do not have access to this file.")

        chunks = hybrid_search(
            topic=request.topic,
            file_id=request.file_id,
            top_k=12,
        )
        if not chunks and not request.outside_sources:
            return _err(
                404, NO_CONTENT_FOUND,
                f"Could not find content for '{request.topic}' in the uploaded file. "
                "Make sure the file uploaded successfully, or enable 'Outside sources' to use general knowledge.",
            )

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


@router.post("/save", status_code=201)
def save_quiz_endpoint(
    request: SaveQuizRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Save a generated quiz.
    created_by always derived from JWT — never from request body.
    is_shared always False on creation.
    """
    try:
        saved = save_quiz(
            title=request.title,
            topic=request.topic,
            difficulty=request.difficulty,
            questions=request.questions,
            created_by=current_user["id"],
            file_id=request.file_id,
            outside_sources=request.outside_sources,
            class_id=request.class_id,
        )
    except Exception:
        return _err(500, INTERNAL_ERROR, "Failed to save quiz.")

    log_event(
        event="quiz.save.completed",
        level="INFO",
        outcome="success",
        meta={"quiz_id": saved.get("id"), "user_id": current_user["id"]},
    )
    return saved


@router.get("/my")
def get_my_quizzes_endpoint(current_user: dict = Depends(get_current_user)):
    """Return saved quizzes for the authenticated student, newest-first."""
    return svc_get_my_quizzes(current_user["id"])


@router.get("/{quiz_id}")
def get_quiz_endpoint(
    quiz_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Load a saved quiz. 404 for non-existent or inaccessible quizzes."""
    try:
        quiz = get_quiz_by_id(quiz_id, current_user["id"])
    except QuizNotFoundError:
        return _err(404, QUIZ_NOT_FOUND, "Quiz not found.")

    log_event(
        event="quiz.load.completed",
        level="INFO",
        outcome="success",
        actor_id=current_user["id"],
        actor_role=current_user.get("role"),
        resource_type="quiz",
        resource_id=quiz_id,
        meta={"quiz_id": quiz_id, "question_count": len(quiz.get("questions", []) if isinstance(quiz, dict) else [])},
    )
    return quiz
