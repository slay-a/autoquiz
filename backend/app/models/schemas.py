from pydantic import BaseModel
from enum import Enum
from typing import Optional, Literal


# ── Job Status ──────────────────────────────────────────────────────────────

class JobStatus(str, Enum):
    queued = "queued"
    in_progress = "in_progress"
    success = "success"
    failed = "failed"


# ── Upload ───────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    file_id: str
    job_id: str
    status: JobStatus
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    file_id: str
    status: JobStatus
    stage: Optional[str] = None        # upload | extract | clean | section | chunk
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str
    updated_at: str


class UserFileEntry(BaseModel):
    file_id: str
    filename: str
    created_at: str


# ── Retrieve ─────────────────────────────────────────────────────────────────

class RetrieveRequest(BaseModel):
    topic: str
    file_id: Optional[str] = None      # scope to a specific doc, or None for all
    top_k: int = 10


class ChunkResult(BaseModel):
    chunk_id: str
    file_id: str
    text: str
    score: float
    page_numbers: list[int]
    section_title: Optional[str] = None


class RetrieveResponse(BaseModel):
    topic: str
    results: list[ChunkResult]


# ── Quiz Generation ───────────────────────────────────────────────────────────

class QuizRequest(BaseModel):
    topic: str
    file_id: Optional[str] = None
    num_questions: int = 5
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    question_types: list[str] = ["mcq", "true_false", "short_answer"]
    outside_sources: bool = False


class QuizOption(BaseModel):
    label: str      # A, B, C, D
    text: str


class QuizQuestion(BaseModel):
    question_id: str
    type: str
    question: str
    options: Optional[list[QuizOption]] = None    # for MCQ
    answer: str
    explanation: str
    source_chunk_ids: list[str]
    page_numbers: list[int]


class QuizResponse(BaseModel):
    quiz_id: str
    topic: str
    difficulty: str
    num_questions: int
    questions: list[QuizQuestion]


# ── Quiz Save ────────────────────────────────────────────────────────────────

class SaveQuizRequest(BaseModel):
    title: str
    topic: str
    difficulty: Literal["easy", "medium", "hard"]
    questions: list[dict]
    file_id: Optional[str] = None
    outside_sources: bool = False
    class_id: Optional[str] = None


# ── Notes ────────────────────────────────────────────────────────────────────

class NotesSaveRequest(BaseModel):
    topic: str
    file_id: Optional[str] = None
    content: dict


class NotesSaveResponse(BaseModel):
    id: str
    title: str
    topic: str
    created_at: str
