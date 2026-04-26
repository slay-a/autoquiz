from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routes import upload, retrieve, quiz, notes, classes, flashcards
from app.api.dependencies import _EnvelopeException
from app.core.error_codes import INTERNAL_ERROR
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
    return {"status": "ok"}
