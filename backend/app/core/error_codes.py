"""
Error code registry for the AutoQuiz API.
Per DESIGN.md §3.1.2, every error code emitted by routes, services, or Celery
tasks must be defined here. Route handlers and tasks import codes from this
module rather than using string literals.
"""

# ── Predefined (user-recoverable) ──────────────────────────────────────────
VALIDATION_FAILED     = "VALIDATION_FAILED"
EMPTY_TOPIC           = "EMPTY_TOPIC"
UNSUPPORTED_FILE_TYPE = "UNSUPPORTED_FILE_TYPE"
UPLOAD_TOO_LARGE      = "UPLOAD_TOO_LARGE"
AUTH_REQUIRED         = "AUTH_REQUIRED"
ROLE_FORBIDDEN        = "ROLE_FORBIDDEN"
JOB_NOT_FOUND         = "JOB_NOT_FOUND"
FILE_NOT_FOUND        = "FILE_NOT_FOUND"
QUIZ_NOT_FOUND        = "QUIZ_NOT_FOUND"
CLASS_CODE_CONFLICT   = "CLASS_CODE_CONFLICT"
CLASS_NOT_FOUND       = "CLASS_NOT_FOUND"
INVALID_JOB_STATE     = "INVALID_JOB_STATE"
NO_CONTENT_FOUND      = "NO_CONTENT_FOUND"
CONTEXT_TOO_LARGE     = "CONTEXT_TOO_LARGE"
RATE_LIMITED          = "RATE_LIMITED"
ADMIN_REQUIRED        = "ADMIN_REQUIRED"

# ── Fail-loud (developer-visible) ─────────────────────────────────────────
PARSE_FAILED          = "PARSE_FAILED"
EMBED_FAILED          = "EMBED_FAILED"
CHUNK_FAILED          = "CHUNK_FAILED"
UPLOAD_FAILED         = "UPLOAD_FAILED"
LLM_RESPONSE_INVALID  = "LLM_RESPONSE_INVALID"
STORAGE_UNAVAILABLE   = "STORAGE_UNAVAILABLE"

# ── Log-and-continue (catch-all) ──────────────────────────────────────────
INTERNAL_ERROR        = "INTERNAL_ERROR"
NOTE_NOT_FOUND        = "NOTE_NOT_FOUND"
NOTES_SAVE_FAILED     = "NOTES_SAVE_FAILED"
CLASS_NOTE_NOT_FOUND  = "CLASS_NOTE_NOT_FOUND"
