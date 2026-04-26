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
