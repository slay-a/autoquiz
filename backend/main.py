from fastapi import FastAPI, Request
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routes import upload, retrieve, quiz, notes, classes, flashcards
from app.api.dependencies import _EnvelopeException
from app.core.error_codes import INTERNAL_ERROR, VALIDATION_FAILED
import uuid as _uuid
import logging as _logging

app = FastAPI(
    title="AutoQuiz API",
    description="AI-powered quiz generation from learning materials",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(_EnvelopeException)
async def envelope_exception_handler(request: Request, exc: _EnvelopeException):
    """Return the pre-built JSONResponse carried inside _EnvelopeException."""
    return exc.response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """
    Wrap every HTTPException in the standard error envelope (DESIGN.md §3.1.1).

    This catches any stray 'raise HTTPException(...)' that bypasses the explicit
    JSON-response pattern used in routes, as well as FastAPI's own routing errors
    (405 Method Not Allowed, etc.) so {"detail": "..."} is never returned.
    """
    _logging.getLogger("autoquiz").warning(
        "HTTPException %s in request %s %s: %s",
        exc.status_code, request.method, request.url.path, exc.detail,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": INTERNAL_ERROR if exc.status_code >= 500 else VALIDATION_FAILED,
                "message": str(exc.detail) if exc.detail else "An error occurred.",
                "request_id": str(_uuid.uuid4()),
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(request: Request, exc: RequestValidationError):
    """
    Handle Pydantic/FastAPI 422 request validation errors.

    Per DESIGN.md §3.1.1: "FastAPI's default 422 validation response is the one
    permitted exception — its detail array shape is preserved unchanged so Pydantic
    tooling keeps working." We preserve the detail array inside the standard envelope.
    """
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": VALIDATION_FAILED,
                "message": "One or more fields are invalid. Please check and try again.",
                "details": exc.errors(),
                "request_id": str(_uuid.uuid4()),
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Global catch-all: any unhandled exception returns the standard 500 envelope.
    Per DESIGN.md §3.1.1 all non-2xx responses use the standard error envelope.
    """
    _logging.getLogger("autoquiz").error(
        "Unhandled exception in request %s %s", request.method, request.url.path,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": INTERNAL_ERROR,
                "message": "Something went wrong on our end. Please try again.",
                "request_id": str(_uuid.uuid4()),
            }
        },
    )


app.include_router(upload.router)
app.include_router(retrieve.router)
app.include_router(quiz.router)
app.include_router(notes.router)
app.include_router(classes.router)
app.include_router(flashcards.router)


@app.get("/health")
def health():
    """Liveness probe — used by docker-compose, k8s, and CI smoke tests."""
    return {
        "status": "ok",
        "service": app.title,
        "version": app.version,
    }
