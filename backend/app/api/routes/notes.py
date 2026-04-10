"""Notes generation — structured study guide for a topic."""

import json
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from openai import OpenAI
from app.core.config import settings
from app.services.retrieval import hybrid_search

router = APIRouter(prefix="/notes", tags=["notes"])
_openai = OpenAI(api_key=settings.openai_api_key)


class NotesRequest(BaseModel):
    topic: str
    file_id: Optional[str] = None
    outside_sources: bool = False


@router.post("/generate")
async def generate_notes(req: NotesRequest):
    chunks = []
    if req.file_id:
        chunks = hybrid_search(topic=req.topic, file_id=req.file_id, top_k=15)

    context = "\n\n---\n\n".join(
        f"[p.{c.get('page_numbers', [])}]\n{c['text']}" for c in chunks
    ) if chunks else "(No uploaded material — use general knowledge.)"

    system = (
        "You are an expert study guide creator. "
        "Generate structured, student-friendly notes from the provided material. "
        "Always respond with valid JSON only."
    )

    prompt = f"""Topic: {req.topic}

Material:
{context}

Generate a comprehensive study guide with this exact JSON structure:
{{
  "summary": "2-3 sentence overview of the topic",
  "key_concepts": [
    {{"term": "...", "definition": "...", "example": "..."}}
  ],
  "important_details": ["bullet point 1", "bullet point 2", ...],
  "common_misconceptions": ["misconception and clarification", ...],
  "scope": {{
    "main_concepts_count": <number>,
    "estimated_questions": {{"min": <number>, "max": <number>}},
    "subtopics": ["subtopic 1", "subtopic 2", ...]
  }},
  "study_tips": ["tip 1", "tip 2", ...]
}}"""

    response = _openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    notes = json.loads(response.choices[0].message.content)
    notes["topic"] = req.topic
    notes["source_pages"] = sorted({p for c in chunks for p in (c.get("page_numbers") or [])})
    return notes
