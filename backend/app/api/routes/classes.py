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
