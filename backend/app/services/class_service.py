"""Service layer for class management operations."""

import random
import string
from supabase import Client


def generate_class_code() -> str:
    """Generate a random 6-character uppercase alphanumeric class code."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def create_class(
    supabase: Client, name: str, description: str | None, instructor_id: str
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
