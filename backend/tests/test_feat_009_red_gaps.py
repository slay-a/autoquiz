"""
Red-phase tests for FEAT-009 blocker gaps.

These tests pin specific architectural violations and missing behaviours.
Each test must fail against the current codebase; the prototyper will make them green.

Blockers targeted:
  B1 – CRITICAL: Layer 1 route handlers call get_supabase() directly (DESIGN.md §0)
  B2 – MAJOR:   HTTPException raised with bare string, not standard error envelope (§3.1.1)
  B4 – MAJOR:   POST /notes/save emits no structured log event (§13.4 + §14.3)
  B5 – FAIL:    test_generate_notes_requires_auth asserts response["detail"] but
                implementation uses envelope response["error"] — fixed version here
  B6 – MAJOR:   notes_gen.py injects topic via raw f-string (§13.8 rule 2)
"""

import ast
import inspect
import textwrap
import uuid
from pathlib import Path
from unittest.mock import Mock, patch
import json
import pytest
from fastapi.testclient import TestClient

from main import app
from app.api.dependencies import get_current_user
from app.services.notes_gen import generate_notes
import app.api.routes.notes as notes_route_module


# ── helpers ───────────────────────────────────────────────────────────────────

def _override(user):
    app.dependency_overrides[get_current_user] = lambda: user
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def student():
    return {"id": "student-111-uuid", "email": "s@test.com", "role": "student"}


@pytest.fixture
def mock_notes():
    return {
        "summary": "Test summary.",
        "key_concepts": [{"term": "t", "definition": "d", "example": "e"}],
        "important_details": ["detail"],
        "common_misconceptions": ["misc"],
        "scope": {"main_concepts_count": 1, "estimated_questions": {"min": 1, "max": 3}, "subtopics": []},
        "study_tips": ["tip"],
    }


# ── B5 (FAIL) — 401 envelope key ─────────────────────────────────────────────

def test_b5_generate_notes_requires_auth_envelope_shape(client):
    """
    B5: AC-9.1.2 — POST /notes/generate without token returns HTTP 401
    with the standard error envelope ({"error": {"code": "AUTH_REQUIRED", ...}}).
    The OLD test wrongly asserted response["detail"]; this pinning test asserts
    the correct envelope shape.
    """
    response = client.post("/notes/generate", json={"topic": "Quantum Physics"})
    assert response.status_code == 401
    body = response.json()
    # Standard error envelope — §3.1.1
    assert "error" in body, f"Expected 'error' key in envelope, got: {list(body.keys())}"
    assert body["error"].get("code") == "AUTH_REQUIRED"


# ── B1 (CRITICAL) — Layer-1 must not call get_supabase() directly ─────────────

def test_b1_save_notes_route_does_not_call_supabase_directly():
    """
    B1 (CRITICAL): Layer-1 route handlers must not call get_supabase() directly
    (DESIGN.md §0: 'No direct DB calls; reads/writes only via service functions').

    This test inspects the AST of notes.py to verify that save_notes_endpoint
    does NOT import or call get_supabase inside a route handler function.
    If the route delegates to a service, the import of get_supabase may still
    exist at module level for legacy reasons; what matters is the route body
    itself does not call it.
    """
    source = Path(notes_route_module.__file__).read_text()
    tree = ast.parse(source)

    # Find save_notes_endpoint function
    route_fn = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name == "save_notes_endpoint":
                route_fn = node
                break

    assert route_fn is not None, "save_notes_endpoint function not found"

    # Collect all calls inside save_notes_endpoint
    calls_in_fn = []
    for node in ast.walk(route_fn):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                calls_in_fn.append(node.func.id)
            elif isinstance(node.func, ast.Attribute):
                calls_in_fn.append(node.func.attr)

    assert "get_supabase" not in calls_in_fn, (
        "save_notes_endpoint calls get_supabase() directly — Layer-1 must delegate "
        "DB work to a service function (DESIGN.md §0 CRITICAL violation)."
    )


def test_b1_get_note_route_does_not_call_supabase_directly():
    """
    B1 (CRITICAL): get_note_endpoint must not call get_supabase() directly.
    """
    source = Path(notes_route_module.__file__).read_text()
    tree = ast.parse(source)

    route_fn = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name == "get_note_endpoint":
                route_fn = node
                break

    assert route_fn is not None, "get_note_endpoint function not found"

    calls_in_fn = []
    for node in ast.walk(route_fn):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                calls_in_fn.append(node.func.id)
            elif isinstance(node.func, ast.Attribute):
                calls_in_fn.append(node.func.attr)

    assert "get_supabase" not in calls_in_fn, (
        "get_note_endpoint calls get_supabase() directly — Layer-1 must delegate "
        "DB work to a service function (DESIGN.md §0 CRITICAL violation)."
    )


def test_b1_get_my_notes_route_does_not_call_supabase_directly():
    """
    B1 (CRITICAL): get_my_notes_endpoint must not call get_supabase() directly.
    """
    source = Path(notes_route_module.__file__).read_text()
    tree = ast.parse(source)

    route_fn = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name == "get_my_notes_endpoint":
                route_fn = node
                break

    assert route_fn is not None, "get_my_notes_endpoint function not found"

    calls_in_fn = []
    for node in ast.walk(route_fn):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                calls_in_fn.append(node.func.id)
            elif isinstance(node.func, ast.Attribute):
                calls_in_fn.append(node.func.attr)

    assert "get_supabase" not in calls_in_fn, (
        "get_my_notes_endpoint calls get_supabase() directly — Layer-1 must delegate "
        "DB work to a service function (DESIGN.md §0 CRITICAL violation)."
    )


# ── B2 (MAJOR) — HTTP errors must use standard error envelope ─────────────────

def test_b2_save_notes_500_uses_error_envelope(client, student, mock_notes):
    """
    B2 (MAJOR): When save fails, the 500 response must use the standard error
    envelope {"error": {"code": ..., "message": ..., "request_id": ...}}
    not a bare {"detail": "Failed to save notes"} (DESIGN.md §3.1.1).
    """
    app.dependency_overrides[get_current_user] = lambda: student
    try:
        with patch("app.services.notes_service.get_supabase") as mock_supa:
            mock_table = Mock()
            mock_table.insert.return_value.execute.return_value = Mock(data=[])
            mock_supa.return_value.table.return_value = mock_table

            response = client.post(
                "/notes/save",
                json={"topic": "Test", "file_id": None, "content": mock_notes},
            )
    finally:
        app.dependency_overrides.clear()

    # Route triggers "if not result.data: raise HTTPException(500, ...)"
    # With standard envelope this should have {"error": {...}} not {"detail": ...}
    assert response.status_code == 500
    body = response.json()
    assert "error" in body, (
        f"Expected standard error envelope with 'error' key, got: {list(body.keys())}. "
        "HTTPException with bare string produces {{'detail': ...}} — "
        "must use standard envelope per DESIGN.md §3.1.1."
    )
    assert "code" in body["error"], "Error envelope missing 'code' field"


def test_b2_get_note_404_uses_error_envelope(client, student):
    """
    B2 (MAJOR): GET /notes/{id} 404 must use standard error envelope.
    """
    app.dependency_overrides[get_current_user] = lambda: student
    try:
        with patch("app.services.notes_service.get_supabase") as mock_supa:
            mock_table = Mock()
            mock_table.select.return_value.eq.return_value.execute.return_value = Mock(data=[])
            mock_supa.return_value.table.return_value = mock_table

            response = client.get(f"/notes/{uuid.uuid4()}")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    body = response.json()
    assert "error" in body, (
        f"Expected standard error envelope with 'error' key, got: {list(body.keys())}. "
        "HTTPException with bare string produces {{'detail': ...}} — "
        "must use standard envelope per DESIGN.md §3.1.1."
    )


def test_b2_get_note_403_uses_error_envelope(client, student):
    """
    B2 (MAJOR): GET /notes/{id} 403 (ownership violation) must use standard error envelope.
    """
    note_id = str(uuid.uuid4())
    app.dependency_overrides[get_current_user] = lambda: student
    try:
        with patch("app.services.notes_service.get_supabase") as mock_supa:
            mock_table = Mock()
            mock_table.select.return_value.eq.return_value.execute.return_value = Mock(data=[{
                "id": note_id,
                "created_by": "different-user-uuid",
                "title": "Someone else's note",
            }])
            mock_supa.return_value.table.return_value = mock_table

            response = client.get(f"/notes/{note_id}")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403
    body = response.json()
    assert "error" in body, (
        f"Expected standard error envelope with 'error' key, got: {list(body.keys())}. "
        "HTTPException with bare string produces {{'detail': ...}} — "
        "must use standard envelope per DESIGN.md §3.1.1."
    )


# ── B4 (MAJOR) — POST /notes/save must emit structured log event ───────────────

def test_b4_save_notes_emits_structured_log_event(client, student, mock_notes):
    """
    B4 (MAJOR): POST /notes/save is a state-changing action and must emit a
    structured log event (DESIGN.md §13.4 rule 1, §14).
    The event name must be 'notes.save.completed' per the naming convention §14.2.
    """
    note_id = str(uuid.uuid4())
    saved_row = {
        "id": note_id,
        "title": "Test Topic",
        "topic": "Test Topic",
        "file_id": None,
        "created_by": student["id"],
        "content": mock_notes,
        "created_at": "2024-01-15T10:00:00Z",
    }

    app.dependency_overrides[get_current_user] = lambda: student
    try:
        with patch("app.services.notes_service.get_supabase") as mock_supa, \
             patch("app.api.routes.notes.log_event") as mock_log:
            mock_table = Mock()
            mock_table.insert.return_value.execute.return_value = Mock(data=[saved_row])
            mock_supa.return_value.table.return_value = mock_table

            response = client.post(
                "/notes/save",
                json={"topic": "Test Topic", "file_id": None, "content": mock_notes},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    # Verify log_event was called with notes.save.completed
    assert mock_log.called, (
        "log_event() was never called during POST /notes/save. "
        "State-changing actions must emit a structured log event per DESIGN.md §13.4."
    )
    calls = mock_log.call_args_list
    event_names = [c.args[0] if c.args else c.kwargs.get("event") for c in calls]
    assert "notes.save.completed" in event_names, (
        f"Expected 'notes.save.completed' event, got events: {event_names}. "
        "Per DESIGN.md §14.2 the event must be domain.entity.action past-tense."
    )


# ── B6 (MAJOR) — notes_gen.py must not inject topic via raw f-string ───────────

def test_b6_notes_gen_does_not_inject_raw_topic_in_prompt():
    """
    B6 (MAJOR): DESIGN.md §13.8 rule 2 prohibits injecting user-controlled values
    directly into LLM prompt strings. The topic must pass through a pre-written
    mapping or be placed in a clearly demarcated, sanitised position.

    This test inspects notes_gen.generate_notes() source to ensure the prompt
    is NOT a raw f-string that directly embeds `topic` with no sanitisation or
    mapping indirection. Acceptable alternatives:
      - A dict mapping topic to a pre-written label
      - A sanitise function called on topic before interpolation
      - Passing topic only as a separate user-message (not interpolated into the
        system prompt or the main instruction text)

    Currently the implementation has:
        prompt = f\"\"\"Topic: {topic}
    which is raw injection — this test must fail until fixed.
    """
    import app.services.notes_gen as notes_gen_module

    source = inspect.getsource(notes_gen_module.generate_notes)

    # A raw `f"""Topic: {topic}` pattern with no sanitise wrapper is the violation.
    # We look for the mapping/sanitise call that should exist before interpolation.
    # If neither a sanitise function call nor a pre-written mapping dict is present,
    # and a direct f-string with {topic} in the prompt body is present, flag it.

    has_raw_injection = "f\"\"\"Topic: {topic}" in source or "f'''Topic: {topic}" in source
    has_sanitise_call = "sanitise" in source or "sanitize" in source or "_topic_label" in source

    assert not has_raw_injection or has_sanitise_call, (
        "notes_gen.generate_notes() injects the user-controlled 'topic' directly "
        "into the LLM prompt via raw f-string (DESIGN.md §13.8 rule 2 violation). "
        "All user-controlled values must pass through a pre-written mapping or "
        "sanitiser before entering a prompt string."
    )
