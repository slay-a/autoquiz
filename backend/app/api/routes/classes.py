"""Class management routes — create, list, and view classes."""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from app.core.supabase import get_supabase
from app.core.error_codes import (
    INTERNAL_ERROR,
    VALIDATION_FAILED,
    ROLE_FORBIDDEN,
    CLASS_CODE_CONFLICT,
    CLASS_NOT_FOUND,
)
from app.core.logging import log_event
from app.api.dependencies import get_current_user
from app.services.class_service import (
    create_class, list_classes, get_class_detail,
    join_class_by_code, get_student_classes as svc_get_student_classes,
    get_student_content as svc_get_student_content,
    save_class_quiz, get_class_quizzes, toggle_quiz_share, delete_class_quiz,
    get_class_notes, create_class_note, update_class_note,
    toggle_note_publish, delete_class_note,
    get_class_files, delete_class_file,
    remove_class_member, delete_class,
)


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
        import uuid as _uuid
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": INTERNAL_ERROR,
                    "message": "Failed to create class. Please try again.",
                    "request_id": str(_uuid.uuid4()),
                }
            },
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
        import uuid as _uuid
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": INTERNAL_ERROR,
                    "message": "Failed to fetch classes. Please try again.",
                    "request_id": str(_uuid.uuid4()),
                }
            },
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
        import uuid as _uuid
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": INTERNAL_ERROR,
                    "message": "Failed to fetch class detail. Please try again.",
                    "request_id": str(_uuid.uuid4()),
                }
            },
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
    Join a class using a class code (AC-3.1.2).

    student_id is extracted from the JWT — never from the request body.
    Returns 404 if class not found, 409 if already a member.
    Delegates to class_service.join_class_by_code() — no inline DB calls.
    Emits class.member.joined log event on success (DESIGN.md §14.3).
    """
    import uuid as _uuid
    if not req.class_code or not req.class_code.strip():
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": VALIDATION_FAILED,
                    "message": "Class code is required.",
                    "request_id": str(_uuid.uuid4()),
                }
            },
        )

    supabase = get_supabase()

    try:
        result = join_class_by_code(
            supabase=supabase,
            class_code=req.class_code.strip(),
            student_id=current_user["id"],
        )
    except ValueError as exc:
        import uuid as _uuid2
        msg = str(exc)
        if msg == "CLASS_NOT_FOUND":
            return JSONResponse(
                status_code=404,
                content={
                    "error": {
                        "code": CLASS_NOT_FOUND,
                        "message": "Class not found. Check the code and try again.",
                        "request_id": str(_uuid2.uuid4()),
                    }
                },
            )
        if msg == "ALREADY_MEMBER":
            return JSONResponse(
                status_code=409,
                content={
                    "error": {
                        "code": CLASS_CODE_CONFLICT,
                        "message": "You're already a member of this class.",
                        "request_id": str(_uuid2.uuid4()),
                    }
                },
            )
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": INTERNAL_ERROR,
                    "message": "Something went wrong on our end. Please try again.",
                    "request_id": str(_uuid2.uuid4()),
                }
            },
        )

    log_event(
        event="class.member.joined",
        level="INFO",
        outcome="success",
        actor_id=current_user["id"],
        actor_role=current_user.get("role"),
        resource_type="class",
        resource_id=result["class_id"],
        meta={"class_id": result["class_id"]},
    )

    return {
        "message": "Successfully joined class",
        "class_id": result["class_id"],
        "class_name": result["class_name"],
    }


@router.get("/student/classes", response_model=list[StudentClassItem])
def get_student_classes_route(current_user: dict = Depends(get_current_user)):
    """
    Get list of classes the current student has joined.
    Delegates to class_service.get_student_classes() — no inline DB calls (DESIGN.md §0).
    """
    import uuid as _uuid
    supabase = get_supabase()

    try:
        classes = svc_get_student_classes(
            supabase=supabase,
            student_id=current_user["id"],
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": VALIDATION_FAILED,
                    "message": str(exc),
                    "request_id": str(_uuid.uuid4()),
                }
            },
        )

    return [
        StudentClassItem(
            id=c["id"],
            name=c["name"],
            description=c.get("description"),
            class_code=c["class_code"],
            created_at=c["created_at"],
        )
        for c in classes
    ]


class SaveQuizRequest(BaseModel):
    title: str
    topic: str
    difficulty: str
    file_id: Optional[str] = None
    questions: list
    outside_sources: bool = False


class ShareQuizRequest(BaseModel):
    is_shared: bool


class SaveNoteRequest(BaseModel):
    title: str
    topic: str
    content: dict


class UpdateNoteRequest(BaseModel):
    title: str
    content: dict


class PublishNoteRequest(BaseModel):
    is_published: bool


@router.get("/student/content", response_model=StudentContentResponse)
def get_student_content_route(current_user: dict = Depends(get_current_user)):
    """
    Get quizzes and notes from joined classes.

    Applies is_shared=true and is_published=true filters at the service/query level.
    Delegates to class_service.get_student_content() — no inline DB calls (DESIGN.md §0).
    """
    import uuid as _uuid
    supabase = get_supabase()

    try:
        content = svc_get_student_content(
            supabase=supabase,
            student_id=current_user["id"],
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": VALIDATION_FAILED,
                    "message": str(exc),
                    "request_id": str(_uuid.uuid4()),
                }
            },
        )

    return StudentContentResponse(
        quizzes=[QuizItem(**q) for q in content["quizzes"]],
        notes=[NoteItem(**n) for n in content["notes"]],
    )


def _require_instructor(supabase, class_id: str, user_id: str):
    """Verify the current user owns the class. Returns class detail or raises."""
    import uuid as _uuid
    cls = get_class_detail(supabase=supabase, class_id=class_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found")
    if cls["instructor_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorised")
    return cls


# ── Quizzes ───────────────────────────────────────────────────────


@router.post("/{class_id}/quizzes", status_code=201)
def save_quiz_to_class(
    class_id: str,
    req: SaveQuizRequest,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    quiz = save_class_quiz(
        supabase, class_id, current_user["id"],
        req.title, req.topic, req.difficulty,
        req.file_id, req.questions, req.outside_sources,
    )
    log_event(
        event="quiz.save.completed",
        level="INFO",
        outcome="success",
        actor_id=current_user["id"],
        actor_role=current_user.get("role"),
        resource_type="quiz",
        resource_id=quiz.get("id"),
        meta={"class_id": class_id, "topic": req.topic, "difficulty": req.difficulty},
    )
    return quiz


@router.get("/{class_id}/quizzes")
def list_class_quizzes(class_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    return get_class_quizzes(supabase, class_id)


@router.patch("/{class_id}/quizzes/{quiz_id}/share")
def share_quiz(
    class_id: str, quiz_id: str,
    req: ShareQuizRequest,
    current_user: dict = Depends(get_current_user),
):
    import uuid as _uuid
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    try:
        quiz = toggle_quiz_share(supabase, class_id, quiz_id, req.is_shared)
    except ValueError:
        return JSONResponse(status_code=404, content={"error": {"code": "QUIZ_NOT_FOUND", "message": "Quiz not found.", "request_id": str(_uuid.uuid4())}})
    log_event(
        event="quiz.share.toggled",
        level="INFO",
        outcome="success",
        actor_id=current_user["id"],
        actor_role=current_user.get("role"),
        resource_type="quiz",
        resource_id=quiz_id,
        meta={"class_id": class_id, "is_shared": req.is_shared},
    )
    return quiz


@router.delete("/{class_id}/quizzes/{quiz_id}", status_code=204)
def remove_quiz(
    class_id: str, quiz_id: str,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    delete_class_quiz(supabase, class_id, quiz_id)


# ── Notes ─────────────────────────────────────────────────────────


@router.get("/{class_id}/notes")
def list_class_notes(class_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    return get_class_notes(supabase, class_id)


@router.post("/{class_id}/notes", status_code=201)
def save_class_note(
    class_id: str,
    req: SaveNoteRequest,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    return create_class_note(supabase, class_id, current_user["id"], req.title, req.topic, req.content)


@router.put("/{class_id}/notes/{note_id}")
def edit_class_note(
    class_id: str, note_id: str,
    req: UpdateNoteRequest,
    current_user: dict = Depends(get_current_user),
):
    import uuid as _uuid
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    try:
        return update_class_note(supabase, class_id, note_id, req.title, req.content)
    except ValueError:
        return JSONResponse(status_code=404, content={"error": {"code": "NOTE_NOT_FOUND", "message": "Note not found.", "request_id": str(_uuid.uuid4())}})


@router.patch("/{class_id}/notes/{note_id}/publish")
def publish_class_note(
    class_id: str, note_id: str,
    req: PublishNoteRequest,
    current_user: dict = Depends(get_current_user),
):
    import uuid as _uuid
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    try:
        return toggle_note_publish(supabase, class_id, note_id, req.is_published)
    except ValueError:
        return JSONResponse(status_code=404, content={"error": {"code": "NOTE_NOT_FOUND", "message": "Note not found.", "request_id": str(_uuid.uuid4())}})


@router.delete("/{class_id}/notes/{note_id}", status_code=204)
def remove_class_note(
    class_id: str, note_id: str,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    delete_class_note(supabase, class_id, note_id)


# ── Files ─────────────────────────────────────────────────────────


@router.get("/{class_id}/files")
def list_class_files(class_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    return get_class_files(supabase, class_id)


@router.delete("/{class_id}/files/{file_id}", status_code=204)
def remove_class_file(
    class_id: str, file_id: str,
    current_user: dict = Depends(get_current_user),
):
    import uuid as _uuid
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    try:
        delete_class_file(supabase, class_id, file_id)
    except ValueError:
        return JSONResponse(status_code=404, content={"error": {"code": "FILE_NOT_FOUND", "message": "File not found.", "request_id": str(_uuid.uuid4())}})


# ── Members & Class ───────────────────────────────────────────────


@router.delete("/{class_id}/members/{student_id}", status_code=204)
def remove_member(
    class_id: str, student_id: str,
    current_user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    remove_class_member(supabase, class_id, student_id)


@router.delete("/{class_id}", status_code=204)
def remove_class(class_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase()
    _require_instructor(supabase, class_id, current_user["id"])
    delete_class(supabase, class_id)
