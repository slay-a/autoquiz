"""
Quiz service — persistence operations for saved_quizzes.
Routes delegate to this service per DESIGN.md layer separation.
"""

from typing import Optional
from app.core.supabase import get_supabase
from app.core.exceptions import AutoQuizError


class QuizNotFoundError(AutoQuizError):
    """Raised when a quiz cannot be found or the caller lacks access."""
    pass


def check_file_ownership(file_id: str, user_id: str) -> None:
    """
    Verify that the given uploaded file belongs to the given user.

    Raises:
        JobNotFoundError: if file_id does not exist (re-used from upload domain)
        AccessDeniedError: if file belongs to a different user
    """
    from app.core.exceptions import JobNotFoundError, AccessDeniedError
    supabase = get_supabase()
    result = (
        supabase.table("uploaded_files")
        .select("uploaded_by")
        .eq("file_id", file_id)
        .execute()
    )
    if not result.data:
        raise JobNotFoundError(f"File not found: {file_id}")
    if result.data[0]["uploaded_by"] != user_id:
        raise AccessDeniedError("You do not have access to this file")


def get_quiz_by_id(quiz_id: str, user_id: str) -> dict:
    """
    Fetch a saved quiz by ID, enforcing access control.

    A quiz is accessible if created_by == user_id OR is_shared == True.

    Raises:
        QuizNotFoundError: if not found or not accessible
    """
    supabase = get_supabase()
    result = (
        supabase.table("saved_quizzes")
        .select("*")
        .eq("id", quiz_id)
        .execute()
    )
    if not result.data:
        raise QuizNotFoundError("Quiz not found")

    quiz = result.data[0]
    if quiz.get("created_by") != user_id and not quiz.get("is_shared", False):
        raise QuizNotFoundError("Quiz not found")

    return quiz


def save_quiz(
    title: str,
    topic: str,
    difficulty: str,
    questions: list,
    created_by: str,
    file_id: Optional[str] = None,
    outside_sources: bool = False,
    class_id: Optional[str] = None,
) -> dict:
    """
    Insert a new row into saved_quizzes.
    created_by always sourced from JWT. is_shared always False on creation.
    """
    supabase = get_supabase()
    payload: dict = {
        "title": title,
        "topic": topic,
        "difficulty": difficulty,
        "questions": questions,
        "created_by": created_by,
        "is_shared": False,
        "outside_sources": outside_sources,
    }
    if file_id is not None:
        payload["file_id"] = file_id
    if class_id is not None:
        payload["class_id"] = class_id

    result = supabase.table("saved_quizzes").insert(payload).execute()
    if not result.data:
        raise Exception("Failed to save quiz: no data returned from insert")

    return result.data[0]


def get_my_quizzes(user_id: str) -> list:
    """Return all saved quizzes for the authenticated student, newest-first."""
    supabase = get_supabase()
    result = (
        supabase.table("saved_quizzes")
        .select("*")
        .eq("created_by", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []
