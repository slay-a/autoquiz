"""
Typed exception hierarchy for the AutoQuiz backend.

Per DESIGN.md §3.1, services raise typed subclasses of AutoQuizError.
Route handlers catch these and map them to HTTPException.
Celery tasks catch them and map to error codes (DESIGN.md §3.1.2).

Hierarchy:
    AutoQuizError (base)
      ├── IngestionError
      │     ├── UnsupportedFileTypeError
      │     ├── ParseError
      │     └── EmbeddingError
      ├── RetrievalError
      │     └── NoChunksFoundError
      ├── GenerationError
      │     ├── LLMResponseParseError
      │     └── ContextTooLargeError
      └── StorageError
"""


class AutoQuizError(Exception):
    """Base exception for all AutoQuiz domain errors."""

    def __init__(self, message: str = "", error_code: str = "") -> None:
        self.message = message
        self.error_code = error_code
        super().__init__(message)


# ── Ingestion ──────────────────────────────────────────────────────────────────

class IngestionError(AutoQuizError):
    """Raised when document ingestion fails at any stage."""


class UnsupportedFileTypeError(IngestionError):
    """Raised when a file extension is not PDF, DOCX, or PPTX."""


class ParseError(IngestionError):
    """Raised when a LlamaIndex reader fails to parse a document."""


class EmbeddingError(IngestionError):
    """Raised when the OpenAI embedding call fails."""


# ── Retrieval ──────────────────────────────────────────────────────────────────

class RetrievalError(AutoQuizError):
    """Raised when the retrieval pipeline fails."""


class NoChunksFoundError(RetrievalError):
    """Raised when no chunks are found for a query."""


# ── Generation ─────────────────────────────────────────────────────────────────

class GenerationError(AutoQuizError):
    """Raised when quiz or notes generation fails."""


class LLMResponseParseError(GenerationError):
    """Raised when the LLM returns an unparseable or schema-invalid response."""


class ContextTooLargeError(GenerationError):
    """Raised when the context exceeds MAX_CONTEXT_CHARS."""


# ── Storage ────────────────────────────────────────────────────────────────────

class StorageError(AutoQuizError):
    """Raised when Supabase Storage operations fail."""


# ── Access / ownership ─────────────────────────────────────────────────────────

class JobNotFoundError(AutoQuizError):
    """Raised when a processing job or file cannot be found."""


class AccessDeniedError(AutoQuizError):
    """Raised when a user attempts to access a resource they don't own."""


class InvalidJobStateError(AutoQuizError):
    """Raised when a job operation is invalid for the current state."""
