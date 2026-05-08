"""Admin routes — full platform management."""

import uuid
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.dependencies import require_admin
from app.core.supabase import get_supabase
from app.core.error_codes import ROLE_FORBIDDEN
from app.core.logging import log_event

router = APIRouter(prefix="/admin", tags=["admin"])


def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "request_id": str(uuid.uuid4())}},
    )


def _log(event, actor_id, resource_type, resource_id, meta=None):
    log_event(event, level="INFO", outcome="success", actor_id=actor_id,
              actor_role="admin", resource_type=resource_type,
              resource_id=resource_id, meta=meta or {})


class RoleUpdateRequest(BaseModel):
    role: str


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats(current_user: dict = Depends(require_admin)):
    s = get_supabase()
    profiles   = s.table("profiles").select("role").execute().data or []
    classes    = s.table("classes").select("id").execute().data or []
    quizzes    = s.table("saved_quizzes").select("id").execute().data or []
    notes      = s.table("class_notes").select("id").execute().data or []
    flashcards = s.table("flashcard_sets").select("id").execute().data or []
    files      = s.table("uploaded_files").select("file_id").execute().data or []
    return {
        "total_users":     len(profiles),
        "students":        sum(1 for p in profiles if p.get("role") == "student"),
        "instructors":     sum(1 for p in profiles if p.get("role") == "instructor"),
        "admins":          sum(1 for p in profiles if p.get("role") == "admin"),
        "total_classes":   len(classes),
        "total_quizzes":   len(quizzes),
        "total_notes":     len(notes),
        "total_flashcards": len(flashcards),
        "total_files":     len(files),
    }


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(current_user: dict = Depends(require_admin)):
    s = get_supabase()
    return s.table("profiles").select("id, email, full_name, role, created_at").order("created_at", desc=True).execute().data or []


@router.patch("/users/{user_id}/role")
def update_user_role(user_id: str, body: RoleUpdateRequest, current_user: dict = Depends(require_admin)):
    if body.role not in ("student", "instructor", "admin"):
        return _err(400, "VALIDATION_FAILED", "Role must be student, instructor, or admin.")
    if user_id == current_user["id"]:
        return _err(400, ROLE_FORBIDDEN, "You cannot change your own role.")
    s = get_supabase()
    result = s.table("profiles").update({"role": body.role}).eq("id", user_id).execute()
    if not result.data:
        return _err(404, "USER_NOT_FOUND", "User not found.")
    _log("admin.user.role_changed", current_user["id"], "user", user_id, {"new_role": body.role})
    return result.data[0]


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, current_user: dict = Depends(require_admin)):
    if user_id == current_user["id"]:
        return _err(400, ROLE_FORBIDDEN, "You cannot delete your own account.")
    get_supabase().table("profiles").delete().eq("id", user_id).execute()
    _log("admin.user.deleted", current_user["id"], "user", user_id)


# ── Classes ───────────────────────────────────────────────────────────────────

@router.get("/classes")
def list_all_classes(current_user: dict = Depends(require_admin)):
    s = get_supabase()
    rows = s.table("classes").select(
        "id, name, description, class_code, created_at, profiles!classes_instructor_id_fkey(full_name, email)"
    ).order("created_at", desc=True).execute().data or []
    return [
        {
            **{k: v for k, v in r.items() if k != "profiles!classes_instructor_id_fkey"},
            "instructor_name":  (r.get("profiles!classes_instructor_id_fkey") or {}).get("full_name"),
            "instructor_email": (r.get("profiles!classes_instructor_id_fkey") or {}).get("email"),
        }
        for r in rows
    ]


@router.delete("/classes/{class_id}", status_code=204)
def admin_delete_class(class_id: str, current_user: dict = Depends(require_admin)):
    from app.services.class_service import delete_class
    delete_class(class_id)
    _log("admin.class.deleted", current_user["id"], "class", class_id)


# ── Quizzes ───────────────────────────────────────────────────────────────────

@router.get("/quizzes")
def list_all_quizzes(current_user: dict = Depends(require_admin)):
    s = get_supabase()
    rows = s.table("saved_quizzes").select(
        "id, title, topic, difficulty, created_at, is_shared, profiles!saved_quizzes_created_by_fkey(full_name, email)"
    ).order("created_at", desc=True).execute().data or []
    return [
        {
            **{k: v for k, v in r.items() if k != "profiles!saved_quizzes_created_by_fkey"},
            "owner_name":  (r.get("profiles!saved_quizzes_created_by_fkey") or {}).get("full_name"),
            "owner_email": (r.get("profiles!saved_quizzes_created_by_fkey") or {}).get("email"),
        }
        for r in rows
    ]


@router.delete("/quizzes/{quiz_id}", status_code=204)
def admin_delete_quiz(quiz_id: str, current_user: dict = Depends(require_admin)):
    get_supabase().table("saved_quizzes").delete().eq("id", quiz_id).execute()
    _log("admin.quiz.deleted", current_user["id"], "quiz", quiz_id)


# ── Notes ─────────────────────────────────────────────────────────────────────

@router.get("/notes")
def list_all_notes(current_user: dict = Depends(require_admin)):
    s = get_supabase()
    rows = s.table("class_notes").select(
        "id, title, created_at, is_published, classes(name)"
    ).order("created_at", desc=True).execute().data or []
    return [
        {
            **{k: v for k, v in r.items() if k != "classes"},
            "class_name": (r.get("classes") or {}).get("name"),
        }
        for r in rows
    ]


@router.delete("/notes/{note_id}", status_code=204)
def admin_delete_note(note_id: str, current_user: dict = Depends(require_admin)):
    get_supabase().table("class_notes").delete().eq("id", note_id).execute()
    _log("admin.note.deleted", current_user["id"], "note", note_id)


# ── Flashcards ────────────────────────────────────────────────────────────────

@router.get("/flashcards")
def list_all_flashcards(current_user: dict = Depends(require_admin)):
    s = get_supabase()
    rows = s.table("flashcard_sets").select(
        "id, title, set_type, is_shared, created_at, profiles!flashcard_sets_created_by_fkey(full_name, email)"
    ).order("created_at", desc=True).execute().data or []
    return [
        {
            **{k: v for k, v in r.items() if k != "profiles!flashcard_sets_created_by_fkey"},
            "owner_name":  (r.get("profiles!flashcard_sets_created_by_fkey") or {}).get("full_name"),
            "owner_email": (r.get("profiles!flashcard_sets_created_by_fkey") or {}).get("email"),
        }
        for r in rows
    ]


@router.delete("/flashcards/{set_id}", status_code=204)
def admin_delete_flashcard(set_id: str, current_user: dict = Depends(require_admin)):
    get_supabase().table("flashcard_sets").delete().eq("id", set_id).execute()
    _log("admin.flashcard.deleted", current_user["id"], "flashcard_set", set_id)
