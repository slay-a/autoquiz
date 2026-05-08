"""
Tests for FEAT-009 Notes Generation (Student).

Tests cover:
- Story 9.1: Generate study notes from uploaded material
- Story 9.2: Save generated notes

Test strategy:
- Integration tests for POST /notes/generate, POST /notes/save, GET /notes/{id}, GET /notes/my
- Unit tests for notes_gen.generate_notes() output structure
- Access control tests (auth required, ownership enforcement)
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from contextlib import contextmanager
import uuid
import json

from main import app
from app.models.schemas import NotesSaveRequest, NotesSaveResponse
from app.api.dependencies import get_current_user
from app.services.notes_gen import generate_notes


# ── Helpers ───────────────────────────────────────────────────────────


@contextmanager
def override_user(user):
    """Context manager to override get_current_user dependency."""
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        yield
    finally:
        app.dependency_overrides.clear()


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def student_user():
    """Fixture for an authenticated student user."""
    return {
        "id": "student-456-uuid",
        "email": "student@example.com",
        "role": "student",
    }


@pytest.fixture
def other_student_user():
    """Fixture for a different student user (for access control tests)."""
    return {
        "id": "student-789-uuid",
        "email": "otherstudent@example.com",
        "role": "student",
    }


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def mock_notes_response():
    """Mock notes structure from GPT-4o."""
    return {
        "summary": "Python exceptions are a mechanism for handling errors at runtime.",
        "key_concepts": [
            {
                "term": "Exception",
                "definition": "An error detected during execution",
                "example": "ZeroDivisionError when dividing by zero"
            },
            {
                "term": "try-except",
                "definition": "Block structure for catching exceptions",
                "example": "try: x/0 except ZeroDivisionError: pass"
            }
        ],
        "important_details": [
            "All exceptions inherit from BaseException",
            "Use specific exception types before general ones",
            "Finally block always executes"
        ],
        "common_misconceptions": [
            "Catching Exception catches everything (it doesn't catch KeyboardInterrupt)",
            "Bare except is good practice (it masks bugs)"
        ],
        "scope": {
            "main_concepts_count": 2,
            "estimated_questions": {"min": 3, "max": 8},
            "subtopics": ["Built-in exceptions", "Custom exceptions", "Exception hierarchy"]
        },
        "study_tips": [
            "Practice writing custom exceptions",
            "Read the official exception hierarchy"
        ]
    }


# ── Story 9.1 — Generate study notes from uploaded material ────────────


def test_generate_notes_requires_auth(client):
    """AC-9.1.2 (CRITICAL): POST /notes/generate returns HTTP 401 when no token provided.
    
    The 401 response uses the standard error envelope (DESIGN.md §3.1.1):
      {"error": {"code": "AUTH_REQUIRED", "message": "...", "request_id": "..."}}
    NOT the FastAPI default {"detail": "..."} shape.
    """
    # No dependency override — simulates unauthenticated request
    response = client.post(
        "/notes/generate",
        json={"topic": "Python Exceptions"},
    )
    assert response.status_code == 401
    body = response.json()
    # Standard error envelope — per DESIGN.md §3.1.1
    assert "error" in body, f"Expected standard envelope with 'error' key, got: {list(body.keys())}"
    assert body["error"]["code"] == "AUTH_REQUIRED"


def test_generate_notes_with_auth_calls_openai(client, student_user, mock_notes_response):
    """AC-9.1.2: Authenticated request succeeds and calls OpenAI."""
    with override_user(student_user), \
         patch("app.services.notes_gen._openai") as mock_openai:

        # Mock OpenAI response
        mock_response = Mock()
        mock_response.choices = [Mock(message=Mock(content=json.dumps(mock_notes_response)))]
        mock_openai.chat.completions.create.return_value = mock_response

        response = client.post(
            "/notes/generate",
            json={"topic": "Python Exceptions"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["topic"] == "Python Exceptions"
        assert "summary" in data
        assert "key_concepts" in data


def test_generate_notes_structure_validation(mock_notes_response):
    """AC-9.1.3 / AC-9.1.4: notes_gen.generate_notes() returns required shape (summary, key_concepts[term/definition/example], important_details, common_misconceptions). Triggered via outside_sources=True path (9.1.4) which exercises the same response contract."""
    with patch("app.services.notes_gen._openai") as mock_openai:
        # Mock OpenAI response
        mock_response = Mock()
        mock_response.choices = [Mock(message=Mock(content=json.dumps(mock_notes_response)))]
        mock_openai.chat.completions.create.return_value = mock_response

        result = generate_notes(
            topic="Python Exceptions",
            chunks=[],
            outside_sources=True
        )

        # Assert required keys from AC-9.1.4
        assert "summary" in result
        assert isinstance(result["summary"], str)

        assert "key_concepts" in result
        assert isinstance(result["key_concepts"], list)
        for concept in result["key_concepts"]:
            assert "term" in concept
            assert "definition" in concept
            assert "example" in concept

        assert "important_details" in result
        assert isinstance(result["important_details"], list)

        assert "common_misconceptions" in result
        assert isinstance(result["common_misconceptions"], list)


# ── Story 9.2 — Save generated notes ────────────────────────────────────


def test_save_notes_inserts_with_jwt_user(client, student_user, mock_notes_response):
    """AC-9.2.1 / AC-9.2.2: POST /notes/save inserts correct row; created_by from JWT."""
    with override_user(student_user), \
         patch("app.services.notes_service.get_supabase") as mock_supabase:

        # Mock Supabase insert
        mock_table = Mock()
        saved_row = {
            "id": str(uuid.uuid4()),
            "title": "Python Exceptions",
            "topic": "Python Exceptions",
            "file_id": None,
            "created_by": student_user["id"],
            "content": mock_notes_response,
            "created_at": "2024-01-15T10:00:00Z"
        }
        mock_table.insert.return_value.execute.return_value = Mock(data=[saved_row])
        mock_supabase.return_value.table.return_value = mock_table

        response = client.post(
            "/notes/save",
            json={
                "topic": "Python Exceptions",
                "file_id": None,
                "content": mock_notes_response
            }
        )

        assert response.status_code == 200
        data = response.json()

        # Assert response shape (AC-9.2.1)
        assert "id" in data
        assert data["title"] == "Python Exceptions"
        assert data["topic"] == "Python Exceptions"
        assert "created_at" in data

        # Assert insert was called with created_by from JWT, not request body
        insert_call_args = mock_table.insert.call_args[0][0]
        assert insert_call_args["created_by"] == student_user["id"]


def test_save_notes_ignores_created_by_in_body(client, student_user, mock_notes_response):
    """AC-9.2.2 (explicit): created_by always from JWT, never from request body."""
    malicious_user_id = "attacker-uuid-999"

    with override_user(student_user), \
         patch("app.services.notes_service.get_supabase") as mock_supabase:

        # Mock Supabase insert
        mock_table = Mock()
        saved_row = {
            "id": str(uuid.uuid4()),
            "title": "Python Exceptions",
            "topic": "Python Exceptions",
            "file_id": None,
            "created_by": student_user["id"],  # Should be JWT user, not malicious ID
            "content": mock_notes_response,
            "created_at": "2024-01-15T10:00:00Z"
        }
        mock_table.insert.return_value.execute.return_value = Mock(data=[saved_row])
        mock_supabase.return_value.table.return_value = mock_table

        # Attempt to inject created_by in request body (should be ignored)
        response = client.post(
            "/notes/save",
            json={
                "topic": "Python Exceptions",
                "file_id": None,
                "content": mock_notes_response,
                "created_by": malicious_user_id  # This should be ignored
            }
        )

        # Even if request body contains created_by, the insert should use JWT user
        insert_call_args = mock_table.insert.call_args[0][0]
        assert insert_call_args["created_by"] == student_user["id"]
        assert insert_call_args["created_by"] != malicious_user_id


def test_get_note_by_id_returns_404_for_nonexistent(client, student_user):
    """GET /notes/{id} — Returns 404 for non-existent ID."""
    with override_user(student_user), \
         patch("app.services.notes_service.get_supabase") as mock_supabase:

        # Mock Supabase to return empty data
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(data=[])
        mock_supabase.return_value.table.return_value = mock_table

        response = client.get(f"/notes/{uuid.uuid4()}")

        assert response.status_code == 404
        body = response.json()
        assert "error" in body
        assert "not found" in body["error"]["message"].lower()


def test_get_note_by_id_returns_403_for_other_users_note(client, student_user, other_student_user):
    """GET /notes/{id} — Returns 403 when note is owned by a different user."""
    note_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.services.notes_service.get_supabase") as mock_supabase:

        # Mock Supabase to return a row owned by other_student_user
        mock_table = Mock()
        other_users_note = {
            "id": note_id,
            "title": "Other Student's Notes",
            "topic": "Machine Learning",
            "created_by": other_student_user["id"],  # Different user
            "content": {},
            "created_at": "2024-01-15T10:00:00Z"
        }
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(data=[other_users_note])
        mock_supabase.return_value.table.return_value = mock_table

        response = client.get(f"/notes/{note_id}")

        assert response.status_code == 403
        body = response.json()
        assert "error" in body
        assert "access" in body["error"]["message"].lower() or body["error"]["code"] == "ROLE_FORBIDDEN"


def test_get_note_by_id_returns_200_for_owned_note(client, student_user, mock_notes_response):
    """GET /notes/{id} — Returns note when owned by current user."""
    note_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.services.notes_service.get_supabase") as mock_supabase:

        # Mock Supabase to return a row owned by student_user
        mock_table = Mock()
        owned_note = {
            "id": note_id,
            "title": "Python Exceptions",
            "topic": "Python Exceptions",
            "created_by": student_user["id"],  # Same user
            "content": mock_notes_response,
            "created_at": "2024-01-15T10:00:00Z"
        }
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(data=[owned_note])
        mock_supabase.return_value.table.return_value = mock_table

        response = client.get(f"/notes/{note_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == note_id
        assert data["title"] == "Python Exceptions"
        assert data["created_by"] == student_user["id"]


def test_get_my_notes_returns_user_notes_only(client, student_user, other_student_user):
    """GET /notes/my — Returns only current user's notes."""
    with override_user(student_user), \
         patch("app.services.notes_service.get_supabase") as mock_supabase:

        # Mock Supabase to return notes for student_user
        mock_table = Mock()
        user_notes = [
            {
                "id": str(uuid.uuid4()),
                "title": "Python Exceptions",
                "topic": "Python Exceptions",
                "created_at": "2024-01-15T10:00:00Z"
            },
            {
                "id": str(uuid.uuid4()),
                "title": "Data Structures",
                "topic": "Data Structures",
                "created_at": "2024-01-14T09:00:00Z"
            }
        ]
        mock_table.select.return_value.eq.return_value.order.return_value.execute.return_value = Mock(data=user_notes)
        mock_supabase.return_value.table.return_value = mock_table

        response = client.get("/notes/my")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["title"] == "Python Exceptions"

        # Verify the query used created_by filter with correct user ID
        mock_table.select.return_value.eq.assert_called_with("created_by", student_user["id"])
