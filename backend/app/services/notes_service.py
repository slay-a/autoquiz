"""
Notes persistence service — Layer 2.

Handles all DB operations for student_notes:
  - save_student_note(...)  → insert a student_notes row
  - get_student_note(...)   → fetch by id with ownership check
  - list_student_notes(...) → list notes for a user

This module is the authoritative Layer 2 boundary for notes DB work.
Routes (Layer 1) must not call get_supabase() directly — they delegate here.

Per DESIGN.md §0: services call infrastructure (Layer 3), routes call services.
"""

from app.core.supabase import get_supabase
from app.core.exceptions import NoteNotFoundError, NoteOwnershipError


def save_student_note(
    *,
    topic: str,
    file_id: "str | None",
    content: dict,
    created_by: str,
) -> dict:
    """
    Insert a row into student_notes.

    Args:
        topic:      The note topic (also used as title).
        file_id:    Optional file ID from uploaded_files.
        content:    Full notes JSON object from GPT-4o.
        created_by: UUID of the owning student — always from JWT, never client input.

    Returns:
        The inserted row dict (id, title, topic, file_id, created_by, content, created_at).

    Raises:
        RuntimeError: if Supabase returns no data (insert failed).
    """
    supabase = get_supabase()
    result = supabase.table("student_notes").insert({
        "title": topic,
        "topic": topic,
        "file_id": file_id,
        "created_by": created_by,
        "content": content,
    }).execute()

    if not result.data:
        raise RuntimeError("Supabase insert returned no data")

    return result.data[0]


def get_student_note(*, note_id: str, requesting_user_id: str) -> dict:
    """
    Fetch a student_notes row by ID and enforce ownership.

    Args:
        note_id:            The UUID primary key.
        requesting_user_id: UUID of the caller — ownership is checked against this.

    Returns:
        The full note row dict.

    Raises:
        NoteNotFoundError:  if no row exists for note_id.
        NoteOwnershipError: if the row exists but belongs to a different user.
    """
    supabase = get_supabase()
    result = supabase.table("student_notes").select("*").eq("id", note_id).execute()

    if not result.data:
        raise NoteNotFoundError(note_id)

    row = result.data[0]

    if row["created_by"] != requesting_user_id:
        raise NoteOwnershipError(note_id)

    return row


def list_student_notes(*, user_id: str) -> list:
    """
    List all student_notes for a given user, newest-first.

    Args:
        user_id: UUID of the student whose notes to list.

    Returns:
        List of partial note dicts (id, title, topic, created_at).
    """
    supabase = get_supabase()
    result = (
        supabase.table("student_notes")
        .select("id, title, topic, created_at")
        .eq("created_by", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data if result.data else []
