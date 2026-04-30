"""
Notes generation service — structured study guide for a topic.
Uses GPT-4o with structured JSON output.

Per DESIGN.md §13.8 rule 2 and §7 rule 2:
  User-controlled values must pass through a sanitiser before entering a prompt.
  The topic is sanitised via _sanitise_topic() which strips and truncates to 300 chars.
"""

import json
from openai import OpenAI
from app.core.config import settings

_openai = OpenAI(api_key=settings.openai_api_key)

_MAX_TOPIC_LEN = 300  # characters; guard against prompt-stuffing via long topics


def _sanitise_topic(topic: str) -> str:
    """
    Strip leading/trailing whitespace and truncate to _MAX_TOPIC_LEN characters.
    This prevents raw user-controlled strings from being injected into the LLM
    prompt without any pre-processing (DESIGN.md §13.8 rule 2, §7 rule 2).
    """
    return topic.strip()[:_MAX_TOPIC_LEN]


def generate_notes(topic: str, chunks: list, outside_sources: bool = False) -> dict:
    """
    Generate structured notes for a topic using OpenAI.

    Args:
        topic: The topic to generate notes for
        chunks: List of retrieved chunks from hybrid_search
        outside_sources: Whether to use general knowledge when no chunks available

    Returns:
        Dictionary containing structured notes with summary, key_concepts, etc.
    """
    safe_topic = _sanitise_topic(topic)

    context = "\n\n---\n\n".join(
        f"[p.{c.get('page_numbers', [])}]\n{c['text']}" for c in chunks
    ) if chunks else "(No uploaded material — use general knowledge.)"

    system = (
        "You are an expert study guide creator. "
        "Generate structured, student-friendly notes from the provided material. "
        "Always respond with valid JSON only."
    )

    prompt = f"""Topic: {safe_topic}

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
    notes["topic"] = safe_topic
    notes["source_pages"] = sorted({p for c in chunks for p in (c.get("page_numbers") or [])})

    return notes
