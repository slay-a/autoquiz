"""Class management routes — create, list, and view classes."""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.core.supabase import get_supabase
from app.api.dependencies import get_current_user
from app.services.class_service import create_class


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

        return class_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create class: {str(e)}")


@router.get("/", response_model=list[ClassListItem])
def list_classes(current_user: dict = Depends(get_current_user)):
    """
    List all classes for the current instructor.

    Returns classes in descending order by created_at (newest first).
    Includes member count for each class.
    """
    supabase = get_supabase()

    try:
        # Fetch classes for this instructor
        result = (
            supabase.table("classes")
            .select("*")
            .eq("instructor_id", current_user["id"])
            .order("created_at", desc=True)
            .execute()
        )

        classes = result.data or []

        # For each class, count members
        enriched_classes = []
        for cls in classes:
            member_count_result = (
                supabase.table("class_members")
                .select("*", count="exact")
                .eq("class_id", cls["id"])
                .execute()
            )

            member_count = member_count_result.count or 0

            enriched_classes.append(
                ClassListItem(
                    id=cls["id"],
                    name=cls["name"],
                    description=cls.get("description"),
                    class_code=cls["class_code"],
                    instructor_id=cls["instructor_id"],
                    created_at=cls["created_at"],
                    member_count=member_count,
                )
            )

        return enriched_classes

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch classes: {str(e)}"
        )


@router.get("/{class_id}", response_model=ClassDetail)
def get_class_detail(class_id: str, current_user: dict = Depends(get_current_user)):
    """
    Get class detail including enrolled students.

    Joins class_members to profiles to get student info.
    """
    supabase = get_supabase()

    try:
        # Fetch the class
        class_result = (
            supabase.table("classes")
            .select("*")
            .eq("id", class_id)
            .single()
            .execute()
        )

        if not class_result.data:
            raise HTTPException(status_code=404, detail="Class not found")

        cls = class_result.data

        # Fetch members with profile info
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
                ClassMember(
                    student_id=m["student_id"],
                    full_name=profile.get("full_name"),
                    email=profile.get("email"),
                    joined_at=m["joined_at"],
                )
            )

        return ClassDetail(
            id=cls["id"],
            name=cls["name"],
            description=cls.get("description"),
            class_code=cls["class_code"],
            instructor_id=cls["instructor_id"],
            created_at=cls["created_at"],
            members=members,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch class detail: {str(e)}"
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
        insert_result = (
            supabase.table("class_members")
            .insert({
                "class_id": cls["id"],
                "student_id": current_user["id"]
            })
            .execute()
        )

        return {
            "message": "Successfully joined class",
            "class_id": cls["id"],
            "class_name": cls["name"]
        }

    except HTTPException:
        raise
    except Exception as e:
        # Check if it's a duplicate constraint error (Supabase error code 23505)
        error_str = str(e)
        if "23505" in error_str or "duplicate" in error_str.lower():
            raise HTTPException(status_code=409, detail="Already a member of this class")
        raise HTTPException(status_code=500, detail=f"Failed to join class: {str(e)}")


@router.get("/student/classes", response_model=list[StudentClassItem])
def get_student_classes(current_user: dict = Depends(get_current_user)):
    """
    Get list of classes the current student has joined.

    Joins class_members + classes, filtered by student_id = auth.uid().
    """
    supabase = get_supabase()

    try:
        # Fetch class memberships for this student
        result = (
            supabase.table("class_members")
            .select("classes(id, name, description, class_code, created_at)")
            .eq("student_id", current_user["id"])
            .execute()
        )

        memberships = result.data or []

        # Extract classes from nested structure
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

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch student classes: {str(e)}"
        )


@router.get("/student/content", response_model=StudentContentResponse)
def get_student_content(current_user: dict = Depends(get_current_user)):
    """
    Get quizzes and notes from joined classes.

    Applies is_shared=true filter on saved_quizzes and is_published=true
    filter on class_notes AT THE QUERY LEVEL. Each item includes the class name.
    """
    supabase = get_supabase()

    try:
        # Fetch class memberships for this student
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

        # Build a map of class_id -> class_name
        class_name_map = {}
        for m in memberships:
            cls = m.get("classes")
            if cls:
                class_name_map[m["class_id"]] = cls["name"]

        # Fetch shared quizzes from joined classes
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

        # Fetch published notes from joined classes
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

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch student content: {str(e)}"
        )
