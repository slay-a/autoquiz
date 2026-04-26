"""Flashcard routes — student flashcard sets."""

from fastapi import APIRouter, Depends
from app.core.supabase import get_supabase
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


@router.get("/my")
def get_my_flashcard_sets(current_user: dict = Depends(get_current_user)):
    """
    Return flashcard sets for the authenticated student.
    Filters by created_by = current_user["id"], ordered newest-first.
    """
    supabase = get_supabase()
    result = (
        supabase.table("flashcard_sets")
        .select("*")
        .eq("created_by", current_user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []
