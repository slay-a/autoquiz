"""
FEAT-002 Red-phase tests — pins gaps identified in V&V triage.

These tests MUST FAIL before the prototyper runs.
Each test is named for its blocker ID.

B-1: list_classes and get_class_detail have inline DB queries (no service delegation)
B-3: Bare except Exception exposes raw error messages
B-4: get_class_detail missing ownership check
B-5: No class.created log event
B-6: 401 tests assert wrong envelope key (["detail"] vs ["error"]["message"])
"""

import pytest
from unittest.mock import Mock, MagicMock, patch, call
import jwt
from datetime import datetime, timedelta
from fastapi.testclient import TestClient

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app
from app.api.dependencies import get_current_user


# ── Fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def instructor_user():
    return {
        "id": "instructor-123-uuid",
        "email": "instructor@example.com",
        "role": "instructor",
    }


@pytest.fixture
def other_instructor_user():
    return {
        "id": "other-instructor-999",
        "email": "other@example.com",
        "role": "instructor",
    }


@pytest.fixture
def auth_token(instructor_user):
    payload = {
        "sub": instructor_user["id"],
        "email": instructor_user["email"],
        "role": instructor_user["role"],
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test-secret", algorithm="HS256")


@pytest.fixture
def other_auth_token(other_instructor_user):
    payload = {
        "sub": other_instructor_user["id"],
        "email": other_instructor_user["email"],
        "role": other_instructor_user["role"],
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test-secret", algorithm="HS256")


@pytest.fixture
def client():
    return TestClient(app)


# ── B-1: Service delegation — list_classes ────────────────────────

class TestB1ServiceDelegation:
    """
    B-1: list_classes and get_class_detail perform DB queries inline
    instead of delegating to a service function.

    These tests verify that the route imports and calls a service
    function for list_classes and get_class_detail operations.
    They FAIL until the prototyper extracts service functions.
    """

    def test_list_classes_route_delegates_to_service_function(self, client, auth_token):
        """
        B-1: list_classes route must call a service-layer function,
        not perform DB queries directly.

        Pins gap: no service function exists for listing classes;
        DB query is inline in the route handler.
        """
        # Import the route module and verify a service function is called
        from app.api.routes import classes as classes_module
        from app.services import class_service

        # The service module must have a list_classes function
        assert hasattr(class_service, "list_classes"), (
            "class_service.py must expose a list_classes() service function; "
            "currently DB queries are inline in the route handler (B-1)"
        )

    def test_get_class_detail_route_delegates_to_service_function(self, client, auth_token):
        """
        B-1: get_class_detail route must call a service-layer function,
        not perform DB queries directly.

        Pins gap: no service function exists for class detail fetching;
        DB query is inline in the route handler.
        """
        from app.services import class_service

        # The service module must have a get_class_detail function
        assert hasattr(class_service, "get_class_detail"), (
            "class_service.py must expose a get_class_detail() service function; "
            "currently DB queries are inline in the route handler (B-1)"
        )

    @patch("app.services.class_service.get_supabase")
    def test_list_classes_route_does_not_call_supabase_directly(
        self, mock_get_supabase, client, auth_token, instructor_user
    ):
        """
        B-1: Route handler for GET /classes must NOT call supabase.table() directly.
        It must call a service function instead.

        This test will FAIL because the current implementation calls
        supabase.table("classes") and supabase.table("class_members") inline.
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Patch the service to return a known value
        with patch("app.api.routes.classes.list_classes") as mock_list_service:
            mock_list_service.return_value = []

            response = client.get(
                "/classes/",
                headers={"Authorization": f"Bearer {auth_token}"},
            )

        # If this import + patch fails, list_classes is not in the route module's namespace
        # (i.e., it was never imported from service)
        assert response.status_code == 200
        mock_list_service.assert_called_once()
        # The route should NOT have called supabase.table() directly
        mock_supabase.table.assert_not_called()


# ── B-4: Ownership check in get_class_detail ─────────────────────

class TestB4OwnershipCheck:
    """
    B-4: get_class_detail does not verify instructor_id == current_user["id"].
    Any authenticated user can read any class's detail.

    DESIGN.md §13.1.1: every route filtering on user-owned data must
    check actor_id ownership.
    """

    @patch("app.api.routes.classes.get_class_detail")
    def test_get_class_detail_returns_403_for_non_owner(
        self, mock_detail_service, client, other_auth_token, instructor_user
    ):
        """
        B-4: GET /classes/{id} must return 403 when the authenticated user
        is NOT the instructor who owns the class.

        The route must check cls_detail["instructor_id"] != current_user["id"]
        and raise 403 if so.
        """
        # Class owned by instructor-123-uuid, not by other-instructor-999
        mock_detail_service.return_value = {
            "id": "class-owned-by-other",
            "name": "Someone Else's Class",
            "description": None,
            "class_code": "OTHER1",
            "instructor_id": instructor_user["id"],  # owned by instructor-123
            "created_at": "2026-04-11T10:00:00Z",
            "members": [],
        }

        # Request made by other-instructor-999 (not the owner)
        response = client.get(
            "/classes/class-owned-by-other",
            headers={"Authorization": f"Bearer {other_auth_token}"},
        )

        assert response.status_code == 403, (
            f"Expected 403 Forbidden for non-owner access, got {response.status_code}. "
            "B-4: ownership check is missing in get_class_detail"
        )


# ── B-5: class.created log event ─────────────────────────────────

class TestB5LogEvent:
    """
    B-5: DESIGN.md §14.3 event catalog lists class.created that must fire
    from "Route · classes". No logging exists in classes.py.
    """

    @patch("app.services.class_service.get_supabase")
    def test_create_class_emits_class_created_log_event(
        self, mock_get_supabase, client, auth_token, instructor_user
    ):
        """
        B-5: POST /classes must emit a 'class.created' structured log event
        via the log_event() helper after a successful class creation.

        Currently no logging is present — this test FAILS.
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_result = Mock()
        mock_result.data = [{
            "id": "new-class-b5",
            "name": "Logged Class",
            "description": None,
            "class_code": "LOG001",
            "instructor_id": instructor_user["id"],
            "created_at": "2026-04-11T12:00:00Z",
        }]
        mock_chain = Mock()
        mock_chain.execute.return_value = mock_result
        mock_supabase.table.return_value.insert.return_value = mock_chain

        with patch("app.api.routes.classes.log_event") as mock_log:
            response = client.post(
                "/classes/",
                json={"name": "Logged Class"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

        assert response.status_code == 201
        mock_log.assert_called_once()
        call_kwargs = mock_log.call_args
        # Verify event name is class.created
        positional = call_kwargs[0] if call_kwargs[0] else []
        keyword = call_kwargs[1] if call_kwargs[1] else {}
        all_args = list(positional) + list(keyword.values())
        assert any("class.created" in str(a) for a in all_args), (
            "log_event must be called with event='class.created' (B-5)"
        )


# ── B-6: 401 error envelope key in existing tests ────────────────

class TestB6ErrorEnvelopeKey:
    """
    B-6: Three existing tests assert response.json()["detail"] but the
    get_current_user dependency returns the standard error envelope:
    {"error": {"code": ..., "message": ...}}

    These tests verify the CORRECT envelope key is used.
    The existing tests use the WRONG key and must be updated.
    """

    def test_post_classes_no_token_uses_error_envelope(self, client):
        """
        B-6: POST /classes with no token must return 401 with
        standard error envelope {"error": {"code": "AUTH_REQUIRED", "message": "..."}}.
        """
        response = client.post(
            "/classes/",
            json={"name": "Test Class"},
        )

        assert response.status_code == 401
        body = response.json()
        # Must have the "error" key, NOT "detail"
        assert "error" in body, (
            f"Expected standard error envelope with 'error' key, got: {body}"
        )
        assert body["error"]["code"] == "AUTH_REQUIRED"
        assert "message" in body["error"]
        # Must NOT use the FastAPI default "detail" key
        assert "detail" not in body, (
            "401 response must use standard error envelope, not FastAPI 'detail'"
        )

    def test_get_classes_no_token_uses_error_envelope(self, client):
        """
        B-6: GET /classes with no token must return 401 with standard error envelope.
        """
        response = client.get("/classes/")

        assert response.status_code == 401
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "AUTH_REQUIRED"
        assert "detail" not in body

    def test_get_class_detail_no_token_uses_error_envelope(self, client):
        """
        B-6: GET /classes/{id} with no token must return 401 with standard error envelope.
        """
        response = client.get("/classes/some-id")

        assert response.status_code == 401
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "AUTH_REQUIRED"
        assert "detail" not in body


# ── B-3: Bare except exposes raw error messages ───────────────────

class TestB3ErrorExposure:
    """
    B-3: Route handlers use bare `except Exception as e` and expose
    str(e) in the response detail. DESIGN.md §3.1 forbids exposing
    raw exception messages to the client.

    These tests verify that 500 responses do NOT leak internal error text.
    """

    @patch("app.services.class_service.get_supabase")
    def test_create_class_500_does_not_expose_exception_message(
        self, mock_get_supabase, client, auth_token
    ):
        """
        B-3: When class creation raises an unexpected error, the 500 response
        must NOT contain the raw exception message string.

        Currently the handler does:
            raise HTTPException(status_code=500, detail=f"Failed to create class: {str(e)}")
        which leaks the exception text.
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Simulate an internal DB error with a specific message
        mock_chain = Mock()
        mock_chain.execute.side_effect = Exception("Internal DB timeout: connection refused at 192.168.1.5:5432")
        mock_supabase.table.return_value.insert.return_value = mock_chain

        response = client.post(
            "/classes/",
            json={"name": "Test Class"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 500
        body = response.json()
        # Raw exception message must NOT be in the response
        response_text = str(body)
        assert "192.168.1.5" not in response_text, (
            "B-3: Internal IP address leaked in 500 response"
        )
        assert "connection refused" not in response_text.lower(), (
            "B-3: Raw exception message leaked in 500 response"
        )
        assert "Internal DB timeout" not in response_text, (
            "B-3: Raw exception message leaked in 500 response"
        )

    @patch("app.services.class_service.get_supabase")
    def test_list_classes_500_does_not_expose_exception_message(
        self, mock_get_supabase, client, auth_token
    ):
        """
        B-3: When list classes raises an unexpected error, the 500 response
        must NOT contain the raw exception message string.
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Simulate a DB error
        mock_chain = Mock()
        mock_chain.eq.return_value = mock_chain
        mock_chain.order.return_value = mock_chain
        mock_chain.execute.side_effect = Exception("DB secret error: password=hunter2")
        mock_supabase.table.return_value.select.return_value = mock_chain

        response = client.get(
            "/classes/",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 500
        body = response.json()
        response_text = str(body)
        assert "hunter2" not in response_text, (
            "B-3: Raw exception message (containing sensitive data) leaked in 500 response"
        )
        assert "DB secret error" not in response_text, (
            "B-3: Raw exception message leaked in 500 response"
        )
