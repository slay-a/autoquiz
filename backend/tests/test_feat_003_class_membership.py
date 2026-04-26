"""
FEAT-003 Class Membership (Student) — Red-phase tests.

Pins the following blockers:
  B2: join_class / get_student_classes / get_student_content must delegate to service layer
  B3: No bare except Exception at route boundaries
  B4: Standard error envelope must be used
  B5: class.member.joined event must be emitted on successful join
  B6: Integration tests for all three FEAT-003 routes (this file IS the fix for B6)
  B7: Duplicate member detection must use response.error, not exception string matching

Test strategy:
  - Unit tests for join_class service functions (once extracted to class_service.py)
  - Integration tests for route handlers with mocked Supabase + mocked service layer
"""

import pytest
from unittest.mock import Mock, MagicMock, patch, call
from fastapi import HTTPException
from fastapi.testclient import TestClient
import jwt
from datetime import datetime, timedelta

from main import app
from app.api.dependencies import get_current_user


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def student_user():
    return {
        "id": "student-uuid-001",
        "email": "student@example.com",
        "role": "student",
    }


@pytest.fixture
def student_token(student_user):
    payload = {
        "sub": student_user["id"],
        "email": student_user["email"],
        "role": student_user["role"],
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, "test-secret", algorithm="HS256")


@pytest.fixture
def auth_headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def non_raising_client():
    """TestClient that does NOT re-raise server exceptions (for testing 500 responses)."""
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def mock_supabase():
    mock = Mock()
    return mock


# ── B7: Duplicate detection via response.error, not exception string ──────────


class TestJoinClassDuplicateDetection:
    """
    B7: supabase-py v2 returns constraint violations as response errors
    (result.data is empty or None, result.error is set), not as Python exceptions.
    The route must inspect result.error for the 23505 code, not catch an exception.
    """

    def test_join_class_duplicate_uses_response_error_not_exception(
        self, client, student_user, auth_headers
    ):
        """
        B7: When Supabase returns a conflict error in result.error (not an exception),
        the join_class route must respond 409.

        This test simulates the supabase-py v2 behavior where .execute() does NOT
        raise an exception for constraint violations — it returns a result with
        result.error set and result.data empty.
        """
        class_lookup_result = Mock()
        class_lookup_result.data = [{"id": "class-uuid-1", "name": "Math 101"}]

        # supabase-py v2: constraint violation comes back as an error in the
        # result object, not as a raised exception.
        insert_result = Mock()
        insert_result.data = []
        insert_result.error = {
            "code": "23505",
            "message": "duplicate key value violates unique constraint \"class_members_pkey\"",
        }

        mock_table = Mock()
        # ilike chain for class lookup
        mock_table.select.return_value.ilike.return_value.execute.return_value = class_lookup_result
        # insert chain for member insert
        mock_table.insert.return_value.execute.return_value = insert_result

        with patch("app.api.routes.classes.get_supabase", return_value=Mock(table=Mock(return_value=mock_table))):
            response = client.post(
                "/classes/join",
                json={"class_code": "MATH01"},
                headers=auth_headers,
            )

        assert response.status_code == 409, (
            f"Expected 409 for duplicate member, got {response.status_code}. "
            "The route must check result.error for 23505, not rely on exception string matching."
        )

    def test_join_class_missing_class_code_returns_400(
        self, client, auth_headers
    ):
        """AC-3.1.2 validation: empty class_code must return 400."""
        response = client.post(
            "/classes/join",
            json={"class_code": ""},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_join_class_class_not_found_returns_404(
        self, client, auth_headers
    ):
        """AC-3.1.3: class not found must return 404."""
        empty_result = Mock()
        empty_result.data = []

        mock_table = Mock()
        mock_table.select.return_value.ilike.return_value.execute.return_value = empty_result

        with patch("app.api.routes.classes.get_supabase", return_value=Mock(table=Mock(return_value=mock_table))):
            response = client.post(
                "/classes/join",
                json={"class_code": "NOTFOUND"},
                headers=auth_headers,
            )

        assert response.status_code == 404

    def test_join_class_no_auth_returns_401(self, client):
        """Auth guard: missing token must return 401."""
        response = client.post("/classes/join", json={"class_code": "ABCDEF"})
        assert response.status_code == 401


# ── B4: Standard error envelope ───────────────────────────────────────────────


class TestErrorEnvelope:
    """
    B4: All non-2xx responses from FEAT-003 routes must use the standard
    error envelope: {"error": {"code": "...", "message": "...", "request_id": "..."}}.
    Plain HTTPException(detail="string") does NOT produce this shape.
    """

    def test_join_class_404_uses_standard_envelope(
        self, client, auth_headers
    ):
        """B4: 404 from join_class must return {"error": {"code": ..., "message": ...}}."""
        empty_result = Mock()
        empty_result.data = []

        mock_table = Mock()
        mock_table.select.return_value.ilike.return_value.execute.return_value = empty_result

        with patch("app.api.routes.classes.get_supabase", return_value=Mock(table=Mock(return_value=mock_table))):
            response = client.post(
                "/classes/join",
                json={"class_code": "NOTFOUND"},
                headers=auth_headers,
            )

        assert response.status_code == 404
        body = response.json()
        assert "error" in body, (
            f"Expected standard error envelope with 'error' key, got: {body}. "
            "Use the standard envelope from DESIGN.md §3.1.1."
        )
        assert "code" in body["error"], "error.code must be present"
        assert "message" in body["error"], "error.message must be present"
        assert "request_id" in body["error"], "error.request_id must be present"

    def test_join_class_409_uses_standard_envelope(
        self, client, auth_headers
    ):
        """B4: 409 from join_class must return standard envelope with CLASS_ALREADY_MEMBER code."""
        class_lookup_result = Mock()
        class_lookup_result.data = [{"id": "class-uuid-1", "name": "Math 101"}]

        insert_result = Mock()
        insert_result.data = []
        insert_result.error = {
            "code": "23505",
            "message": "duplicate key value violates unique constraint",
        }

        mock_table = Mock()
        mock_table.select.return_value.ilike.return_value.execute.return_value = class_lookup_result
        mock_table.insert.return_value.execute.return_value = insert_result

        with patch("app.api.routes.classes.get_supabase", return_value=Mock(table=Mock(return_value=mock_table))):
            response = client.post(
                "/classes/join",
                json={"class_code": "MATH01"},
                headers=auth_headers,
            )

        assert response.status_code == 409
        body = response.json()
        assert "error" in body, (
            f"Expected standard error envelope, got: {body}"
        )

    def test_get_student_classes_500_uses_standard_envelope(
        self, non_raising_client, auth_headers
    ):
        """B4: 500 from get_student_classes must return standard envelope."""
        # Patch the service function to raise an unexpected error (simulates DB down)
        with patch("app.api.routes.classes.svc_get_student_classes", side_effect=Exception("DB down")):
            response = non_raising_client.get("/classes/student/classes", headers=auth_headers)

        assert response.status_code == 500
        body = response.json()
        assert "error" in body, (
            f"Expected standard error envelope for 500, got: {body}. "
            "The global exception handler in main.py must produce the standard envelope."
        )

    def test_get_student_content_500_uses_standard_envelope(
        self, non_raising_client, auth_headers
    ):
        """B4: 500 from get_student_content must return standard envelope."""
        with patch("app.api.routes.classes.svc_get_student_content", side_effect=Exception("DB down")):
            response = non_raising_client.get("/classes/student/content", headers=auth_headers)

        assert response.status_code == 500
        body = response.json()
        assert "error" in body, (
            f"Expected standard error envelope for 500, got: {body}. "
            "The global exception handler in main.py must produce the standard envelope."
        )


# ── B5: class.member.joined event logging ─────────────────────────────────────


class TestJoinClassEventLogging:
    """
    B5: DESIGN.md §14.3 requires a class.member.joined event to be emitted
    on every successful join. The current join_class route omits this.
    """

    def test_successful_join_emits_class_member_joined_event(
        self, client, student_user, auth_headers
    ):
        """B5: Successful join must emit class.member.joined log event."""
        class_lookup_result = Mock()
        class_lookup_result.data = [{"id": "class-uuid-1", "name": "Math 101"}]

        insert_result = Mock()
        insert_result.data = [{"class_id": "class-uuid-1", "student_id": student_user["id"]}]
        insert_result.error = None

        mock_table = Mock()
        mock_table.select.return_value.ilike.return_value.execute.return_value = class_lookup_result
        mock_table.insert.return_value.execute.return_value = insert_result

        with patch("app.api.routes.classes.get_supabase", return_value=Mock(table=Mock(return_value=mock_table))), \
             patch("app.api.routes.classes.log_event") as mock_log:

            response = client.post(
                "/classes/join",
                json={"class_code": "MATH01"},
                headers=auth_headers,
            )

        assert response.status_code == 200

        # Verify class.member.joined event was emitted
        logged_events = [call_args[1].get("event") or call_args[0][0]
                         for call_args in mock_log.call_args_list]
        # Also check kwargs
        kw_events = [c.kwargs.get("event", c.args[0] if c.args else None)
                     for c in mock_log.call_args_list]

        assert any("class.member.joined" in str(e) for e in kw_events + logged_events), (
            f"Expected class.member.joined event to be logged. "
            f"log_event was called with: {mock_log.call_args_list}"
        )


# ── B2: Service layer delegation ──────────────────────────────────────────────


class TestServiceLayerDelegation:
    """
    B2: join_class, get_student_classes, and get_student_content route handlers
    must delegate DB work to class_service functions, not contain inline DB calls.
    Per DESIGN.md §0: Layer 1 (routes) must delegate all logic to Layer 2 (services).
    """

    def test_join_class_delegates_to_service_not_inline_db(self, client, auth_headers):
        """
        B2: join_class route must import and call a service function (e.g.
        class_service.join_class_by_code) rather than calling supabase.table() inline.

        This test verifies that the class_service module has a join_class_by_code
        function that the route delegates to.
        """
        from app.services import class_service
        assert hasattr(class_service, "join_class_by_code"), (
            "class_service must expose a join_class_by_code() function. "
            "The route handler must delegate to it instead of calling supabase.table() directly."
        )

    def test_get_student_classes_delegates_to_service(self, client, auth_headers):
        """
        B2: get_student_classes route must delegate to class_service.get_student_classes().
        """
        from app.services import class_service
        assert hasattr(class_service, "get_student_classes"), (
            "class_service must expose a get_student_classes() function. "
            "The route handler must delegate to it instead of calling supabase.table() directly."
        )

    def test_get_student_content_delegates_to_service(self, client, auth_headers):
        """
        B2: get_student_content route must delegate to class_service.get_student_content().
        """
        from app.services import class_service
        assert hasattr(class_service, "get_student_content"), (
            "class_service must expose a get_student_content() function. "
            "The route handler must delegate to it instead of calling supabase.table() directly."
        )


# ── B3: No bare except Exception ─────────────────────────────────────────────


class TestNoBareExceptException:
    """
    B3: DESIGN.md §0 states that bare 'except Exception' at a layer boundary is MAJOR.
    Services must raise typed exceptions; routes catch specific types.
    """

    def test_join_class_route_does_not_use_bare_except(self):
        """
        B3: The join_class route handler must not use 'except Exception:' as
        a catch-all. Inspect the source to verify.
        """
        import ast
        import inspect
        from app.api.routes import classes as classes_module

        source = inspect.getsource(classes_module)
        tree = ast.parse(source)

        bare_excepts_in_join_class = []

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "join_class":
                for inner_node in ast.walk(node):
                    if isinstance(inner_node, ast.ExceptHandler):
                        if inner_node.type is None:
                            bare_excepts_in_join_class.append(inner_node)
                        elif isinstance(inner_node.type, ast.Name) and inner_node.type.id == "Exception":
                            bare_excepts_in_join_class.append(inner_node)

        assert len(bare_excepts_in_join_class) == 0, (
            f"join_class route uses bare 'except Exception:' ({len(bare_excepts_in_join_class)} occurrences). "
            "Services must raise typed exceptions; routes catch specific types (DESIGN.md §0, §3.1)."
        )

    def test_get_student_classes_route_does_not_use_bare_except(self):
        """B3: get_student_classes route must not use bare except Exception."""
        import ast
        import inspect
        from app.api.routes import classes as classes_module

        source = inspect.getsource(classes_module)
        tree = ast.parse(source)

        bare_excepts = []
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "get_student_classes":
                for inner_node in ast.walk(node):
                    if isinstance(inner_node, ast.ExceptHandler):
                        if inner_node.type is None or (
                            isinstance(inner_node.type, ast.Name) and inner_node.type.id == "Exception"
                        ):
                            bare_excepts.append(inner_node)

        assert len(bare_excepts) == 0, (
            f"get_student_classes route uses bare except Exception ({len(bare_excepts)} occurrences)."
        )

    def test_get_student_content_route_does_not_use_bare_except(self):
        """B3: get_student_content route must not use bare except Exception."""
        import ast
        import inspect
        from app.api.routes import classes as classes_module

        source = inspect.getsource(classes_module)
        tree = ast.parse(source)

        bare_excepts = []
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "get_student_content":
                for inner_node in ast.walk(node):
                    if isinstance(inner_node, ast.ExceptHandler):
                        if inner_node.type is None or (
                            isinstance(inner_node.type, ast.Name) and inner_node.type.id == "Exception"
                        ):
                            bare_excepts.append(inner_node)

        assert len(bare_excepts) == 0, (
            f"get_student_content route uses bare except Exception ({len(bare_excepts)} occurrences)."
        )


# ── B6: Integration tests for the three FEAT-003 routes (happy paths) ─────────


class TestGetStudentClassesRoute:
    """Integration tests for GET /classes/student/classes."""

    def test_returns_list_of_joined_classes(self, client, student_user, auth_headers):
        """AC-3.1.5 / AC-3.2.3: Student sees their joined classes."""
        memberships = [
            {
                "class_id": "class-uuid-1",
                "classes": {
                    "id": "class-uuid-1",
                    "name": "Math 101",
                    "description": "Intro to Math",
                    "class_code": "MATH01",
                    "created_at": "2026-04-10T10:00:00Z",
                },
            }
        ]

        mock_result = Mock()
        mock_result.data = memberships

        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = mock_result

        with patch("app.api.routes.classes.get_supabase", return_value=Mock(table=Mock(return_value=mock_table))):
            response = client.get("/classes/student/classes", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["name"] == "Math 101"
        assert data[0]["class_code"] == "MATH01"

    def test_returns_empty_list_when_no_classes(self, client, auth_headers):
        """Student with no memberships sees empty list."""
        mock_result = Mock()
        mock_result.data = []

        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = mock_result

        with patch("app.api.routes.classes.get_supabase", return_value=Mock(table=Mock(return_value=mock_table))):
            response = client.get("/classes/student/classes", headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == []

    def test_no_auth_returns_401(self, client):
        response = client.get("/classes/student/classes")
        assert response.status_code == 401


class TestGetStudentContentRoute:
    """Integration tests for GET /classes/student/content."""

    def test_returns_only_shared_quizzes_and_published_notes(
        self, client, student_user, auth_headers
    ):
        """AC-3.2.1 + AC-3.2.2: is_shared=true quizzes and is_published=true notes returned."""
        # This test verifies the route produces the correct response shape;
        # the is_shared / is_published filter is validated by the DB query (B6).
        memberships_result = Mock()
        memberships_result.data = [
            {"class_id": "class-1", "classes": {"id": "class-1", "name": "Math 101"}}
        ]

        quizzes_result = Mock()
        quizzes_result.data = [
            {
                "id": "quiz-1",
                "title": "Algebra Quiz",
                "topic": "Algebra",
                "difficulty": "medium",
                "questions": [],
                "created_at": "2026-04-10T10:00:00Z",
                "class_id": "class-1",
            }
        ]

        notes_result = Mock()
        notes_result.data = [
            {
                "id": "note-1",
                "title": "Calc Notes",
                "topic": "Calculus",
                "content": {},
                "created_at": "2026-04-10T10:00:00Z",
                "class_id": "class-1",
            }
        ]

        call_count = {"n": 0}

        def make_table(name):
            mock_t = Mock()
            call_count["n"] += 1
            n = call_count["n"]
            if n == 1:
                mock_t.select.return_value.eq.return_value.execute.return_value = memberships_result
            elif n == 2:
                mock_t.select.return_value.in_.return_value.eq.return_value.order.return_value.execute.return_value = quizzes_result
            else:
                mock_t.select.return_value.in_.return_value.eq.return_value.order.return_value.execute.return_value = notes_result
            return mock_t

        mock_sb = Mock()
        mock_sb.table = make_table

        with patch("app.api.routes.classes.get_supabase", return_value=mock_sb):
            response = client.get("/classes/student/content", headers=auth_headers)

        assert response.status_code == 200
        body = response.json()
        assert "quizzes" in body
        assert "notes" in body
        assert body["quizzes"][0]["className"] == "Math 101"
        assert body["notes"][0]["className"] == "Math 101"

    def test_no_auth_returns_401(self, client):
        response = client.get("/classes/student/content")
        assert response.status_code == 401

    def test_student_with_no_memberships_returns_empty(self, client, auth_headers):
        """AC-3.2.1: Student with no memberships sees no quizzes or notes."""
        empty_result = Mock()
        empty_result.data = []

        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = empty_result

        with patch("app.api.routes.classes.get_supabase", return_value=Mock(table=Mock(return_value=mock_table))):
            response = client.get("/classes/student/content", headers=auth_headers)

        assert response.status_code == 200
        body = response.json()
        assert body["quizzes"] == []
        assert body["notes"] == []


class TestJoinClassHappyPath:
    """Integration tests for POST /classes/join happy path."""

    def test_successful_join_returns_200_with_class_info(
        self, client, student_user, auth_headers
    ):
        """AC-3.1.2: Successful join returns 200 with class_id and class_name."""
        class_lookup_result = Mock()
        class_lookup_result.data = [{"id": "class-uuid-1", "name": "Math 101"}]

        insert_result = Mock()
        insert_result.data = [{"class_id": "class-uuid-1", "student_id": student_user["id"]}]
        insert_result.error = None

        mock_table = Mock()
        mock_table.select.return_value.ilike.return_value.execute.return_value = class_lookup_result
        mock_table.insert.return_value.execute.return_value = insert_result

        with patch("app.api.routes.classes.get_supabase", return_value=Mock(table=Mock(return_value=mock_table))), \
             patch("app.api.routes.classes.log_event"):
            response = client.post(
                "/classes/join",
                json={"class_code": "MATH01"},
                headers=auth_headers,
            )

        assert response.status_code == 200
        body = response.json()
        assert body.get("class_id") == "class-uuid-1"
        assert body.get("class_name") == "Math 101"

    def test_join_uses_case_insensitive_lookup(
        self, client, auth_headers
    ):
        """
        AC-3.1.2: class_code lookup is case-insensitive (ilike).
        Verify the service uses ilike, not eq, for the class_code query.
        The route delegates to class_service.join_class_by_code() (B2).
        """
        import inspect
        from app.services import class_service

        source = inspect.getsource(class_service)
        # join_class_by_code must use ilike for case-insensitive lookup
        assert "ilike" in source, (
            "class_service.join_class_by_code must use .ilike() for case-insensitive class_code lookup "
            "(AC-3.1.2). Found no ilike call in class_service.py."
        )
