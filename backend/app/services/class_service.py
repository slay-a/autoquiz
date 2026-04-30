"""Service layer for class management operations."""

import random
import string
from typing import Optional
from supabase import Client


def generate_class_code() -> str:
    """Generate a random 6-character uppercase alphanumeric class code."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def create_class(
    supabase: Client, name: str, description: Optional[str], instructor_id: str
) -> dict:
    """
    Create a new class with a unique class_code.

    Retries up to 10 times if a unique constraint collision occurs on class_code.

    Args:
        supabase: Supabase client instance
        name: Class name
        description: Optional class description
        instructor_id: UUID of the instructor (from JWT)

    Returns:
        The created class record as a dict

    Raises:
        Exception: If unable to create after 10 retries or other DB error
    """
    max_retries = 10

    for attempt in range(max_retries):
        class_code = generate_class_code()

        try:
            result = (
                supabase.table("classes")
                .insert(
                    {
                        "name": name,
                        "description": description,
                        "class_code": class_code,
                        "instructor_id": instructor_id,
                    }
                )
                .execute()
            )

            if result.data and len(result.data) > 0:
                return result.data[0]

        except Exception as e:
            error_message = str(e).lower()

            # Check for unique constraint violation on class_code
            # Postgres error code 23505 or message containing "duplicate" or "unique"
            if "23505" in error_message or "duplicate" in error_message or "unique" in error_message:
                # Collision detected, retry with a new code
                if attempt < max_retries - 1:
                    continue
                else:
                    raise Exception(
                        "Failed to generate unique class code after 10 attempts"
                    ) from e
            else:
                # Some other error, re-raise immediately
                raise

    raise Exception("Failed to create class after 10 attempts")


def list_classes(supabase: Client, instructor_id: str) -> list[dict]:
    """
    Fetch all classes for a given instructor, with member counts.

    Returns classes in descending order by created_at (newest first).
    Each class dict includes a 'member_count' key.

    Args:
        supabase: Supabase client instance
        instructor_id: UUID of the instructor (from JWT)

    Returns:
        List of class dicts, each with an added 'member_count' field

    Raises:
        Exception: On DB error
    """
    result = (
        supabase.table("classes")
        .select("*")
        .eq("instructor_id", instructor_id)
        .order("created_at", desc=True)
        .execute()
    )

    classes = result.data or []

    enriched_classes = []
    for cls in classes:
        member_count_result = (
            supabase.table("class_members")
            .select("*", count="exact")
            .eq("class_id", cls["id"])
            .execute()
        )
        member_count = member_count_result.count or 0
        enriched_classes.append({**cls, "member_count": member_count})

    return enriched_classes


def get_class_detail(supabase: Client, class_id: str) -> Optional[dict]:
    """
    Fetch a single class record with its enrolled members.

    Returns None if the class is not found.
    The returned dict includes a 'members' list; each member has:
        student_id, joined_at, full_name, email

    Args:
        supabase: Supabase client instance
        class_id: UUID of the class to fetch

    Returns:
        Class detail dict with members list, or None if not found

    Raises:
        Exception: On DB error
    """
    class_result = (
        supabase.table("classes")
        .select("*")
        .eq("id", class_id)
        .single()
        .execute()
    )

    if not class_result.data:
        return None

    cls = class_result.data

    members_result = (
        supabase.table("class_members")
        .select("student_id, joined_at, profiles(full_name, email)")
        .eq("class_id", class_id)
        .execute()
    )

    members_data = members_result.data or []
    members = []
    for m in members_data:
        profile = m.get("profiles") or {}
        members.append(
            {
                "student_id": m["student_id"],
                "joined_at": m["joined_at"],
                "full_name": profile.get("full_name"),
                "email": profile.get("email"),
            }
        )

    return {**cls, "members": members}


def join_class_by_code(supabase: Client, class_code: str, student_id: str) -> dict:
    """
    Join a class by class_code (case-insensitive).

    Returns the joined class info dict: {"class_id": ..., "class_name": ...}

    Raises:
        ValueError("CLASS_NOT_FOUND")  — no class with that code
        ValueError("ALREADY_MEMBER")   — student already in class (23505 constraint)
        Exception                      — unexpected DB error
    """
    class_result = (
        supabase.table("classes")
        .select("id, name")
        .ilike("class_code", class_code.strip())
        .execute()
    )

    if not class_result.data:
        raise ValueError("CLASS_NOT_FOUND")

    cls = class_result.data[0]

    insert_result = (
        supabase.table("class_members")
        .insert({"class_id": cls["id"], "student_id": student_id})
        .execute()
    )

    # supabase-py v2 returns constraint violations as result.error, not exceptions.
    if insert_result.error:
        error_info = insert_result.error
        code = str(error_info.get("code", "")) if isinstance(error_info, dict) else str(error_info)
        message = str(error_info.get("message", "")).lower() if isinstance(error_info, dict) else str(error_info).lower()
        if "23505" in code or "23505" in message or "duplicate" in message:
            raise ValueError("ALREADY_MEMBER")
        raise Exception(f"DB insert error: {error_info}")

    return {"class_id": cls["id"], "class_name": cls["name"]}


def get_student_classes(supabase: Client, student_id: str) -> list[dict]:
    """
    Return a list of classes the student has joined.

    Each item: {id, name, description, class_code, created_at}

    Raises:
        Exception — on DB error
    """
    result = (
        supabase.table("class_members")
        .select("classes(id, name, description, class_code, created_at)")
        .eq("student_id", student_id)
        .execute()
    )

    memberships = result.data or []
    classes = []
    for m in memberships:
        cls = m.get("classes")
        if cls:
            classes.append({
                "id": cls["id"],
                "name": cls["name"],
                "description": cls.get("description"),
                "class_code": cls["class_code"],
                "created_at": cls["created_at"],
            })
    return classes


def save_class_quiz(
    supabase: Client, class_id: str, instructor_id: str,
    title: str, topic: str, difficulty: str,
    file_id: Optional[str], questions: list, outside_sources: bool
) -> dict:
    result = (
        supabase.table("saved_quizzes")
        .insert({
            "title": title,
            "topic": topic,
            "difficulty": difficulty,
            "file_id": file_id,
            "created_by": instructor_id,
            "class_id": class_id,
            "is_shared": False,
            "outside_sources": outside_sources,
            "questions": questions,
        })
        .execute()
    )
    return result.data[0]


def get_class_quizzes(supabase: Client, class_id: str) -> list[dict]:
    result = (
        supabase.table("saved_quizzes")
        .select("*")
        .eq("class_id", class_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def toggle_quiz_share(supabase: Client, class_id: str, quiz_id: str, is_shared: bool) -> dict:
    result = (
        supabase.table("saved_quizzes")
        .update({"is_shared": is_shared})
        .eq("id", quiz_id)
        .eq("class_id", class_id)
        .execute()
    )
    if not result.data:
        raise ValueError("QUIZ_NOT_FOUND")
    return result.data[0]


def delete_class_quiz(supabase: Client, class_id: str, quiz_id: str) -> None:
    supabase.table("saved_quizzes").delete().eq("id", quiz_id).eq("class_id", class_id).execute()


def get_class_notes(supabase: Client, class_id: str) -> list[dict]:
    result = (
        supabase.table("class_notes")
        .select("*")
        .eq("class_id", class_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def create_class_note(
    supabase: Client, class_id: str, instructor_id: str,
    title: str, topic: str, content: dict
) -> dict:
    result = (
        supabase.table("class_notes")
        .insert({
            "class_id": class_id,
            "created_by": instructor_id,
            "title": title,
            "topic": topic,
            "content": content,
            "is_published": False,
        })
        .execute()
    )
    return result.data[0]


def update_class_note(
    supabase: Client, class_id: str, note_id: str,
    title: str, content: dict
) -> dict:
    result = (
        supabase.table("class_notes")
        .update({"title": title, "content": content})
        .eq("id", note_id)
        .eq("class_id", class_id)
        .execute()
    )
    if not result.data:
        raise ValueError("NOTE_NOT_FOUND")
    return result.data[0]


def toggle_note_publish(
    supabase: Client, class_id: str, note_id: str, is_published: bool
) -> dict:
    result = (
        supabase.table("class_notes")
        .update({"is_published": is_published})
        .eq("id", note_id)
        .eq("class_id", class_id)
        .execute()
    )
    if not result.data:
        raise ValueError("NOTE_NOT_FOUND")
    return result.data[0]


def get_class_note_by_id(supabase: Client, note_id: str) -> dict | None:
    result = supabase.table("class_notes").select("*").eq("id", note_id).execute()
    return result.data[0] if result.data else None


def delete_class_note(supabase: Client, class_id: str, note_id: str) -> None:
    supabase.table("class_notes").delete().eq("id", note_id).eq("class_id", class_id).execute()


def get_class_files(supabase: Client, class_id: str) -> list[dict]:
    files_result = (
        supabase.table("uploaded_files")
        .select("*")
        .eq("class_id", class_id)
        .order("created_at", desc=True)
        .execute()
    )
    files = files_result.data or []
    jobs_result = (
        supabase.table("processing_jobs")
        .select("file_id")
        .eq("status", "success")
        .execute()
    )
    success_ids = {j["file_id"] for j in (jobs_result.data or [])}
    for f in files:
        f["processing_done"] = f["file_id"] in success_ids
    return files


def delete_class_file(supabase: Client, class_id: str, file_id: str) -> None:
    file_result = (
        supabase.table("uploaded_files")
        .select("file_id, filename")
        .eq("file_id", file_id)
        .eq("class_id", class_id)
        .execute()
    )
    if not file_result.data:
        raise ValueError("FILE_NOT_FOUND")
    f = file_result.data[0]
    supabase.storage.from_("uploads").remove([f"{f['file_id']}/{f['filename']}"])
    supabase.table("chunks").delete().eq("file_id", file_id).execute()
    supabase.table("processing_jobs").delete().eq("file_id", file_id).execute()
    supabase.table("uploaded_files").delete().eq("file_id", file_id).execute()


def remove_class_member(supabase: Client, class_id: str, student_id: str) -> None:
    supabase.table("class_members").delete().eq("class_id", class_id).eq("student_id", student_id).execute()


def delete_class(supabase: Client, class_id: str) -> None:
    supabase.table("classes").delete().eq("id", class_id).execute()


def get_student_content(supabase: Client, student_id: str) -> dict:
    """
    Return shared quizzes and published notes for the student's joined classes.

    Filters:
      - saved_quizzes: is_shared=True, class_id in student's classes
      - class_notes:   is_published=True, class_id in student's classes

    Returns:
        {"quizzes": [...], "notes": [...]}

    Raises:
        Exception — on DB error
    """
    memberships_result = (
        supabase.table("class_members")
        .select("class_id, classes(id, name)")
        .eq("student_id", student_id)
        .execute()
    )

    memberships = memberships_result.data or []
    class_ids = [m["class_id"] for m in memberships if m.get("class_id")]

    if not class_ids:
        return {"quizzes": [], "notes": []}

    class_name_map = {}
    for m in memberships:
        cls = m.get("classes")
        if cls:
            class_name_map[m["class_id"]] = cls["name"]

    quizzes_result = (
        supabase.table("saved_quizzes")
        .select("id, title, topic, difficulty, questions, created_at, class_id")
        .in_("class_id", class_ids)
        .eq("is_shared", True)
        .order("created_at", desc=True)
        .execute()
    )

    quizzes = []
    for q in (quizzes_result.data or []):
        quizzes.append({
            "id": q["id"],
            "title": q["title"],
            "topic": q["topic"],
            "difficulty": q["difficulty"],
            "questions": q["questions"],
            "created_at": q["created_at"],
            "className": class_name_map.get(q["class_id"], "Unknown Class"),
        })

    notes_result = (
        supabase.table("class_notes")
        .select("id, title, topic, content, created_at, class_id")
        .in_("class_id", class_ids)
        .eq("is_published", True)
        .order("created_at", desc=True)
        .execute()
    )

    notes = []
    for n in (notes_result.data or []):
        notes.append({
            "id": n["id"],
            "title": n["title"],
            "topic": n["topic"],
            "content": n["content"],
            "created_at": n["created_at"],
            "className": class_name_map.get(n["class_id"], "Unknown Class"),
        })

    return {"quizzes": quizzes, "notes": notes}
