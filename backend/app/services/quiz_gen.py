"""
E3 — Generate high-quality questions from retrieved context.
Uses GPT-4o with structured JSON output.
"""

import json
import uuid
from openai import OpenAI
from app.core.config import settings
from app.models.schemas import QuizQuestion, QuizOption

_openai = OpenAI(api_key=settings.openai_api_key)

SYSTEM_PROMPT = """You are an expert quiz creator. Given source passages, generate quiz questions.
Always respond with valid JSON only. Do not include any text outside the JSON object."""

QUESTION_SCHEMA = """
{
  "questions": [
    {
      "type": "mcq" | "true_false" | "short_answer",
      "question": "...",
      "options": [{"label": "A", "text": "..."}, ...],  // only for mcq
      "answer": "...",
      "explanation": "..."
    }
  ]
}
"""


def generate_quiz(
    topic: str,
    chunks: list[dict],
    num_questions: int = 5,
    difficulty: str = "medium",
    question_types: list[str] = ["mcq", "true_false", "short_answer"],
) -> list[QuizQuestion]:
    context = "\n\n---\n\n".join(
        f"[Page(s) {c.get('page_numbers', [])} | Section: {c.get('section_title', 'N/A')}]\n{c['text']}"
        for c in chunks
    )

    user_prompt = f"""Topic: {topic}
Difficulty: {difficulty}
Question types to use: {', '.join(question_types)}
Number of questions: {num_questions}

Source material:
{context}

Generate {num_questions} questions grounded strictly in the source material above.
Respond with JSON matching this schema:
{QUESTION_SCHEMA}"""

    response = _openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    raw = json.loads(response.choices[0].message.content)
    questions = []

    for i, q in enumerate(raw.get("questions", [])):
        options = None
        if q.get("type") == "mcq" and q.get("options"):
            options = [QuizOption(label=o["label"], text=o["text"]) for o in q["options"]]

        # Map source chunks for citation
        source_chunk_ids = [c["chunk_id"] for c in chunks]
        page_numbers = sorted({p for c in chunks for p in (c.get("page_numbers") or [])})

        questions.append(QuizQuestion(
            question_id=str(uuid.uuid4()),
            type=q.get("type", "short_answer"),
            question=q["question"],
            options=options,
            answer=q["answer"],
            explanation=q.get("explanation", ""),
            source_chunk_ids=source_chunk_ids,
            page_numbers=page_numbers,
        ))

    return questions
