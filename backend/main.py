from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import upload, retrieve, quiz

app = FastAPI(
    title="AutoQuiz API",
    description="AI-powered quiz generation from learning materials",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(retrieve.router)
app.include_router(quiz.router)


@app.get("/health")
def health():
    return {"status": "ok"}
