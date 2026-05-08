"""
Seed demo data for the AutoQuiz live demo.

Idempotently creates:
  • One instructor user — instructor.demo@autoquiz.local / DemoPass123!
  • One student user    — student.demo@autoquiz.local    / DemoPass123!
  • One class           — "AutoQuiz Demo Class"
  • Class membership    — student joined the class
  • One shared quiz     — "Demo: Software Requirements"

Usage:
    cd backend
    source venv/bin/activate
    python -m scripts.seed_demo

Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment (the
service key is needed because we use auth.admin.create_user). Safe to
re-run — existing rows are detected by email / instructor_id and reused.
"""

from __future__ import annotations

import sys
from typing import Optional

from app.core.supabase import get_supabase
from app.services import class_service

INSTRUCTOR_EMAIL = "instructor.demo@autoquiz.local"
STUDENT_EMAIL = "student.demo@autoquiz.local"
DEMO_PASSWORD = "DemoPass123!"

CLASS_NAME = "AutoQuiz Demo Class"
CLASS_DESCRIPTION = "Pre-seeded class for live demos and grading walkthroughs."

QUIZ_TITLE = "Demo: Software Requirements"
QUIZ_QUESTIONS = [
    {
        "type": "multiple_choice",
        "question": "Which document captures *what* a system must do, independent of *how*?",
        "options": [
            "System Design Document",
            "Software Requirements Specification",
            "Test Plan",
            "Deployment Runbook",
        ],
        "answer": "Software Requirements Specification",
        "explanation": "The SRS is the canonical functional + non-functional requirements artifact.",
    },
    {
        "type": "true_false",
        "question": "Acceptance criteria belong inside user stories, not in a separate document.",
        "answer": "True",
        "explanation": "ACs are part of the story so they travel with the story through grooming and review.",
    },
]


def _find_user_by_email(supabase, email: str) -> Optional[dict]:
    """Page through auth.admin.list_users() until we find the matching email."""
    page = 1
    per_page = 100
    while True:
        users = supabase.auth.admin.list_users(page=page, per_page=per_page)
        if not users:
            return None
        for u in users:
            if getattr(u, "email", None) == email:
                return {"id": u.id, "email": u.email}
        if len(users) < per_page:
            return None
        page += 1


def _ensure_user(supabase, email: str, role: str, full_name: str) -> str:
    existing = _find_user_by_email(supabase, email)
    if existing:
        user_id = existing["id"]
        print(f"  ✔ user exists: {email} ({user_id})")
    else:
        created = supabase.auth.admin.create_user({
            "email": email,
            "password": DEMO_PASSWORD,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name, "role": role},
        })
        user_id = created.user.id
        print(f"  ✔ created user: {email} ({user_id})")

    # Upsert into profiles so the role is set (the auth trigger usually does
    # this, but a service-role upsert here makes the script idempotent across
    # environments where the trigger is missing).
    supabase.table("profiles").upsert({
        "id": user_id,
        "email": email,
        "full_name": full_name,
        "role": role,
    }).execute()
    return user_id


def _ensure_class(instructor_id: str) -> dict:
    supabase = get_supabase()
    existing = (
        supabase.table("classes")
        .select("*")
        .eq("instructor_id", instructor_id)
        .eq("name", CLASS_NAME)
        .limit(1)
        .execute()
    )
    if existing.data:
        cls = existing.data[0]
        print(f"  ✔ class exists: {CLASS_NAME} ({cls['id']}, code={cls['class_code']})")
        return cls
    cls = class_service.create_class(
        name=CLASS_NAME,
        description=CLASS_DESCRIPTION,
        instructor_id=instructor_id,
    )
    print(f"  ✔ created class: {CLASS_NAME} ({cls['id']}, code={cls['class_code']})")
    return cls


def _ensure_membership(class_id: str, student_id: str) -> None:
    supabase = get_supabase()
    existing = (
        supabase.table("class_members")
        .select("class_id")
        .eq("class_id", class_id)
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        print(f"  ✔ membership exists")
        return
    supabase.table("class_members").insert({
        "class_id": class_id,
        "student_id": student_id,
    }).execute()
    print(f"  ✔ student joined class")


def _ensure_demo_quiz(instructor_id: str, class_id: str) -> None:
    supabase = get_supabase()
    existing = (
        supabase.table("saved_quizzes")
        .select("id")
        .eq("user_id", instructor_id)
        .eq("title", QUIZ_TITLE)
        .limit(1)
        .execute()
    )
    if existing.data:
        print(f"  ✔ shared quiz exists ({existing.data[0]['id']})")
        return
    inserted = supabase.table("saved_quizzes").insert({
        "user_id": instructor_id,
        "class_id": class_id,
        "title": QUIZ_TITLE,
        "topic": "Software Requirements",
        "difficulty": "easy",
        "questions": QUIZ_QUESTIONS,
        "is_shared": True,
    }).execute()
    quiz_id = inserted.data[0]["id"] if inserted.data else "?"
    print(f"  ✔ created shared quiz ({quiz_id})")


def main() -> int:
    supabase = get_supabase()

    print("Seeding instructor…")
    instructor_id = _ensure_user(supabase, INSTRUCTOR_EMAIL, "instructor", "Demo Instructor")

    print("Seeding student…")
    student_id = _ensure_user(supabase, STUDENT_EMAIL, "student", "Demo Student")

    print("Seeding class…")
    cls = _ensure_class(instructor_id)

    print("Seeding membership…")
    _ensure_membership(cls["id"], student_id)

    print("Seeding shared quiz…")
    _ensure_demo_quiz(instructor_id, cls["id"])

    print()
    print("Demo seed complete. Login credentials:")
    print(f"  instructor: {INSTRUCTOR_EMAIL} / {DEMO_PASSWORD}")
    print(f"  student   : {STUDENT_EMAIL} / {DEMO_PASSWORD}")
    print(f"  class code: {cls['class_code']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
