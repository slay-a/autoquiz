from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.routes import upload, retrieve, quiz, notes, classes
from app.api.dependencies import _EnvelopeException

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


app.include_router(upload.router)
app.include_router(retrieve.router)
app.include_router(quiz.router)
app.include_router(notes.router)
app.include_router(classes.router)


@app.get("/health")
def health():
    return {"status": "ok"}
