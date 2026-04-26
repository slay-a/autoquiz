"""Class management routes — create, list, and view classes."""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from app.core.supabase import get_supabase
from app.core.error_codes import (
    INTERNAL_ERROR,
    VALIDATION_FAILED,
    ROLE_FORBIDDEN,
)
from app.core.logging import log_event
from app.api.dependencies import get_current_user
from app.services.class_service import create_class, list_classes, get_class_detail


router = APIRouter(prefix="/classes", tags=["classes"])


# ── Request/Response Schemas ──────────────────────────────────────


class CreateClassRequest(BaseModel):
    name: str
    description: Optional[str] = None


class ClassMember(BaseModel):
    student_id: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    joined_at: str


class ClassListItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    class_code: str
    instructor_id: str
    created_at: str
    member_count: int


class ClassDetail(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    class_code: str
    instructor_id: str
    created_at: str
    members: list[ClassMember]


class JoinClassRequest(BaseModel):
    class_code: str


class StudentClassItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    class_code: str
    created_at: str


class QuizItem(BaseModel):
    id: str
    title: str
    topic: str
    difficulty: str
    questions: list
    created_at: str
    className: str


class NoteItem(BaseModel):
    id: str
    title: str
    topic: str
    content: dict
    created_at: str
    className: str


class StudentContentResponse(BaseModel):
    quizzes: list[QuizItem]
    notes: list[NoteItem]


# ── Routes ────────────────────────────────────────────────────────


@router.post("/", status_code=201)
def create_class_route(
    req: CreateClassRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Create a new class.

    instructor_id is extracted from the JWT — never from the request body.
    Emits class.created log event on success (DESIGN.md §14.3).
    """
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Class name is required")

    supabase = get_supabase()

    try:
        class_data = create_class(
            supabase=supabase,
            name=req.name.strip(),
            description=req.description.strip() if req.description else None,
            instructor_id=current_user["id"],
        )

        log_event(
            event="class.created",
            level="INFO",
            outcome="success",
            actor_id=current_user["id"],
            actor_role=current_user.get("role"),
            resource_type="class",
            resource_id=class_data.get("id"),
            meta={"class_id": class_data.get("id")},
        )

        return class_data

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to create class. Please try again.",
        )


@router.get("/", response_model=list[ClassListItem])
def list_classes_route(current_user: dict = Depends(get_current_user)):
    """
    List all classes for the current instructor.

    Returns classes in descending order by created_at (newest first).
    Includes member count for each class.
    Delegates to class_service.list_classes() — no DB calls in this layer.
    """
    supabase = get_supabase()

    try:
        classes = list_classes(
            supabase=supabase,
            instructor_id=current_user["id"],
        )

        return [
            ClassListItem(
                id=cls["id"],
                name=cls["name"],
                description=cls.get("description"),
                class_code=cls["class_code"],
                instructor_id=cls["instructor_id"],
                created_at=cls["created_at"],
                member_count=cls.get("member_count", 0),
            )
            for cls in classes
        ]

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch classes. Please try again.",
        )


@router.get("/{class_id}", response_model=ClassDetail)
def get_class_detail_route(
    class_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Get class detail including enrolled students.

    Enforces ownership: only the instructor who created the class may access it.
    Delegates to class_service.get_class_detail() — no DB calls in this layer.
    """
    supabase = get_supabase()

    try:
        cls_detail = get_class_detail(supabase=supabase, class_id=class_id)
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch class detail. Please try again.",
        )

    if cls_detail is None:
        raise HTTPException(status_code=404, detail="Class not found")

    # Ownership check: only the owning instructor may access this class (DESIGN.md §13.1.1)
    if cls_detail["instructor_id"] != current_user["id"]:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to access this class.",
        )

    return ClassDetail(
        id=cls_detail["id"],
        name=cls_detail["name"],
        description=cls_detail.get("description"),
        class_code=cls_detail["class_code"],
        instructor_id=cls_detail["instructor_id"],
        created_at=cls_detail["created_at"],
        members=[
            ClassMember(
                student_id=m["student_id"],
                full_name=m.get("full_name"),
                email=m.get("email"),
                joined_at=m["joined_at"],
            )
            for m in cls_detail.get("members", [])
        ],
    )


@router.post("/join", status_code=200)
def join_class(
    req: JoinClassRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Join a class using a class code.

    student_id is extracted from the JWT — never from the request body.
    Returns 404 if class not found, 409 if already a member.
    """
    if not req.class_code or not req.class_code.strip():
        raise HTTPException(status_code=400, detail="Class code is required")

    supabase = get_supabase()

    try:
        # Case-insensitive lookup of class by class_code
        class_result = (
            supabase.table("classes")
            .select("id, name")
            .ilike("class_code", req.class_code.strip())
            .execute()
        )

        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")

        cls = class_result.data[0]

        # Insert into class_members
        supabase.table("class_members").insert(
            {
                "class_id": cls["id"],
                "student_id": current_user["id"],
            }
        ).execute()

        return {
            "message": "Successfully joined class",
            "class_id": cls["id"],
            "class_name": cls["name"],
        }

    except HTTPException:
        raise
    except Exception as e:
        # Check if it's a duplicate constraint error (Supabase error code 23505)
        error_str = str(e)
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise HTTPException(
                status_code=409, detail="Already a member of this class"
            )
        raise HTTPException(
            status_code=500,
            detail="Failed to join class. Please try again.",
        )


@router.get("/student/classes", response_model=list[StudentClassItem])
def get_student_classes(current_user: dict = Depends(get_current_user)):
    """
    Get list of classes the current student has joined.
    """
    supabase = get_supabase()

    try:
        result = (
            supabase.table("class_members")
            .select("classes(id, name, description, class_code, created_at)")
            .eq("student_id", current_user["id"])
            .execute()
        )

        memberships = result.data or []

        classes = []
        for m in memberships:
            cls = m.get("classes")
            if cls:
                classes.append(
                    StudentClassItem(
                        id=cls["id"],
                        name=cls["name"],
                        description=cls.get("description"),
                        class_code=cls["class_code"],
                        created_at=cls["created_at"],
                    )
                )

        return classes

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch student classes. Please try again.",
        )


@router.get("/student/content", response_model=StudentContentResponse)
def get_student_content(current_user: dict = Depends(get_current_user)):
    """
    Get quizzes and notes from joined classes.

    Applies is_shared=true filter on saved_quizzes and is_published=true
    filter on class_notes AT THE QUERY LEVEL.
    """
    supabase = get_supabase()

    try:
        memberships_result = (
            supabase.table("class_members")
            .select("class_id, classes(id, name)")
            .eq("student_id", current_user["id"])
            .execute()
        )

        memberships = memberships_result.data or []
        class_ids = [m["class_id"] for m in memberships if m.get("class_id")]

        if not class_ids:
            return StudentContentResponse(quizzes=[], notes=[])

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

        quizzes_data = quizzes_result.data or []
        quizzes = []
        for q in quizzes_data:
            quizzes.append(
                QuizItem(
                    id=q["id"],
                    title=q["title"],
                    topic=q["topic"],
                    difficulty=q["difficulty"],
                    questions=q["questions"],
                    created_at=q["created_at"],
                    className=class_name_map.get(q["class_id"], "Unknown Class"),
                )
            )

        notes_result = (
            supabase.table("class_notes")
            .select("id, title, topic, content, created_at, class_id")
            .in_("class_id", class_ids)
            .eq("is_published", True)
            .order("created_at", desc=True)
            .execute()
        )

        notes_data = notes_result.data or []
        notes = []
        for n in notes_data:
            notes.append(
                NoteItem(
                    id=n["id"],
                    title=n["title"],
                    topic=n["topic"],
                    content=n["content"],
                    created_at=n["created_at"],
                    className=class_name_map.get(n["class_id"], "Unknown Class"),
                )
            )

        return StudentContentResponse(quizzes=quizzes, notes=notes)

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch student content. Please try again.",
        )
