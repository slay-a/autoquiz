"""Flashcard routes — student flashcard sets.

All endpoints are authenticated. Ownership is enforced on write operations
(update, delete, share toggle): only the creator may modify a set.

Route ordering note: fixed-segment routes (/my, /by-type, /) are declared
before parametric routes (/{set_id}) so FastAPI's first-match router does
not swallow them.
"""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.supabase import get_supabase
from app.api.dependencies import get_current_user
from app.core.logging import log_event

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "request_id": str(uuid.uuid4())}},
    )


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class CreateFlashcardSetRequest(BaseModel):
    title: str
    cards: list
    quiz_id: Optional[str] = None
    class_id: Optional[str] = None
    is_shared: bool = False
    set_type: Optional[str] = None


class UpdateFlashcardSetRequest(BaseModel):
    title: str
    cards: list


class ShareFlashcardSetRequest(BaseModel):
    is_public: bool
    share_code: Optional[str] = None


# ── Fixed-segment routes (must come before parametric /{set_id} routes) ──────

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


@router.post("/")
def create_flashcard_set(
    body: CreateFlashcardSetRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new flashcard set owned by the authenticated user.
    Returns the created row.
    """
    supabase = get_supabase()
    payload = {
        "title": body.title,
        "cards": body.cards,
        "created_by": current_user["id"],
        "is_shared": body.is_shared,
    }
    if body.quiz_id:
        payload["quiz_id"] = body.quiz_id
    if body.class_id:
        payload["class_id"] = body.class_id
    if body.set_type:
        payload["set_type"] = body.set_type

    result = supabase.table("flashcard_sets").insert(payload).execute()
    if not result.data:
        return _err(500, "INTERNAL_ERROR", "Failed to create flashcard set.")
    row = result.data[0]
    log_event(
        "flashcard.set.created",
        level="INFO",
        outcome="success",
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        resource_type="flashcard_set",
        resource_id=row.get("id"),
        meta={
            "set_id": row.get("id"),
            "card_count": len(body.cards) if body.cards else 0,
            "set_type": body.set_type or "custom",
        },
    )
    return row


@router.delete("/by-type")
def delete_flashcard_set_by_type(
    quiz_id: str,
    set_type: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Delete flashcard sets matching quiz_id + set_type + created_by.
    Used for deduplication before creating a replacement set.
    Query params: quiz_id, set_type
    """
    supabase = get_supabase()
    (
        supabase.table("flashcard_sets")
        .delete()
        .eq("quiz_id", quiz_id)
        .eq("set_type", set_type)
        .eq("created_by", current_user["id"])
        .execute()
    )
    return {"deleted": True}


# ── Parametric routes ─────────────────────────────────────────────────────────

@router.get("/{set_id}")
def get_flashcard_set(set_id: str, current_user: dict = Depends(get_current_user)):
    """
    Return a single flashcard set by ID.
    The set must belong to the authenticated user OR be shared/public.
    Returns 404 if not found, 403 if access denied.
    """
    supabase = get_supabase()
    result = (
        supabase.table("flashcard_sets")
        .select("*")
        .eq("id", set_id)
        .single()
        .execute()
    )
    if not result.data:
        return _err(404, "FLASHCARD_SET_NOT_FOUND", "Flashcard set not found.")

    row = result.data
    # Allow access if owner, or if shared/public
    if (
        row.get("created_by") != current_user["id"]
        and not row.get("is_shared")
        and not row.get("is_public")
    ):
        return _err(403, "ACCESS_DENIED", "You do not have access to this flashcard set.")

    return row


@router.put("/{set_id}")
def update_flashcard_set(
    set_id: str,
    body: UpdateFlashcardSetRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Update title and cards of a flashcard set.
    Only the owner may update.
    """
    supabase = get_supabase()

    # Ownership check
    existing = (
        supabase.table("flashcard_sets")
        .select("created_by")
        .eq("id", set_id)
        .single()
        .execute()
    )
    if not existing.data:
        return _err(404, "FLASHCARD_SET_NOT_FOUND", "Flashcard set not found.")
    if existing.data["created_by"] != current_user["id"]:
        return _err(403, "ACCESS_DENIED", "You do not own this flashcard set.")

    result = (
        supabase.table("flashcard_sets")
        .update({"title": body.title, "cards": body.cards})
        .eq("id", set_id)
        .select()
        .single()
        .execute()
    )
    return result.data or {}


@router.delete("/{set_id}")
def delete_flashcard_set(set_id: str, current_user: dict = Depends(get_current_user)):
    """
    Delete a flashcard set.
    Only the owner may delete.
    """
    supabase = get_supabase()

    # Ownership check
    existing = (
        supabase.table("flashcard_sets")
        .select("created_by")
        .eq("id", set_id)
        .single()
        .execute()
    )
    if not existing.data:
        return _err(404, "FLASHCARD_SET_NOT_FOUND", "Flashcard set not found.")
    if existing.data["created_by"] != current_user["id"]:
        return _err(403, "ACCESS_DENIED", "You do not own this flashcard set.")

    supabase.table("flashcard_sets").delete().eq("id", set_id).execute()
    return {"deleted": True}


@router.patch("/{set_id}/share")
def share_flashcard_set(
    set_id: str,
    body: ShareFlashcardSetRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Toggle the is_public flag (and optionally set share_code) on a flashcard set.
    Only the owner may toggle sharing.
    """
    supabase = get_supabase()

    # Ownership check
    existing = (
        supabase.table("flashcard_sets")
        .select("created_by")
        .eq("id", set_id)
        .single()
        .execute()
    )
    if not existing.data:
        return _err(404, "FLASHCARD_SET_NOT_FOUND", "Flashcard set not found.")
    if existing.data["created_by"] != current_user["id"]:
        return _err(403, "ACCESS_DENIED", "You do not own this flashcard set.")

    update_payload: dict = {"is_public": body.is_public}
    if body.share_code is not None:
        update_payload["share_code"] = body.share_code

    result = (
        supabase.table("flashcard_sets")
        .update(update_payload)
        .eq("id", set_id)
        .select()
        .single()
        .execute()
    )
    scope = "public" if body.is_public else "class"
    log_event(
        "flashcard.set.shared",
        level="INFO",
        outcome="success",
        actor_id=current_user.get("id"),
        actor_role=current_user.get("role"),
        resource_type="flashcard_set",
        resource_id=set_id,
        meta={"set_id": set_id, "scope": scope},
    )
    return result.data or {}
