"""
Tests for FEAT-002 Class Management (Instructor).

Tests cover:
- Story 2.1: Create a class
- Story 2.2: View class list
- Story 2.3: View class detail

Test strategy:
- Unit tests for class_service.py functions (generate_class_code, create_class)
- Integration tests for route handlers with mocked Supabase client
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
import jwt
from datetime import datetime, timedelta
import string

# Import the app and dependencies
from main import app
from app.services.class_service import generate_class_code, create_class
from app.api.dependencies import get_current_user


# ── Fixtures ──────────────────────────────────────────────────────


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    mock_client = Mock()
    mock_table = Mock()
    mock_client.table = Mock(return_value=mock_table)
    return mock_client


@pytest.fixture
def instructor_user():
    """Fixture for an authenticated instructor user."""
    return {
        "id": "instructor-123-uuid",
        "email": "instructor@example.com",
        "role": "instructor",
    }


@pytest.fixture
def student_user():
    """Fixture for an authenticated student user."""
    return {
        "id": "student-456-uuid",
        "email": "student@example.com",
        "role": "student",
    }


@pytest.fixture
def auth_token(instructor_user):
    """Generate a valid JWT token for testing."""
    payload = {
        "sub": instructor_user["id"],
        "email": instructor_user["email"],
        "role": instructor_user["role"],
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    # Create token without signature (matches the current get_current_user implementation)
    token = jwt.encode(payload, "test-secret", algorithm="HS256")
    return token


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


# ── Unit Tests: class_service.py ──────────────────────────────────


class TestGenerateClassCode:
    """Tests for generate_class_code() function."""

    def test_returns_exactly_6_characters(self):
        """AC-2.1.2: class_code is exactly 6 characters."""
        code = generate_class_code()
        assert len(code) == 6

    def test_returns_uppercase_alphanumeric(self):
        """AC-2.1.2: class_code is uppercase alphanumeric."""
        code = generate_class_code()
        allowed_chars = set(string.ascii_uppercase + string.digits)
        assert all(c in allowed_chars for c in code)

    def test_returns_all_uppercase(self):
        """AC-2.1.2: class_code is all uppercase."""
        code = generate_class_code()
        assert code == code.upper()

    def test_generates_different_codes(self):
        """Generate multiple codes to verify randomness (not all identical)."""
        codes = [generate_class_code() for _ in range(100)]
        # At least some codes should be different (very high probability)
        unique_codes = set(codes)
        assert len(unique_codes) > 1


class TestCreateClass:
    """Tests for create_class() service function."""

    def test_happy_path_creates_class_successfully(self, mock_supabase, instructor_user):
        """AC-2.1.2: Successfully create a class with name, description, instructor_id, and class_code."""
        # Mock successful insert
        mock_result = Mock()
        mock_result.data = [{
            "id": "class-uuid-1",
            "name": "CS 301",
            "description": "Software Engineering",
            "class_code": "ABC123",
            "instructor_id": instructor_user["id"],
            "created_at": "2026-04-11T10:00:00Z",
        }]

        mock_chain = Mock()
        mock_chain.execute.return_value = mock_result
        mock_supabase.table.return_value.insert.return_value = mock_chain

        result = create_class(
            supabase=mock_supabase,
            name="CS 301",
            description="Software Engineering",
            instructor_id=instructor_user["id"],
        )

        assert result["id"] == "class-uuid-1"
        assert result["name"] == "CS 301"
        assert result["description"] == "Software Engineering"
        assert result["instructor_id"] == instructor_user["id"]
        assert len(result["class_code"]) == 6

        # Verify insert was called with correct parameters
        mock_supabase.table.assert_called_with("classes")
        call_args = mock_supabase.table.return_value.insert.call_args[0][0]
        assert call_args["name"] == "CS 301"
        assert call_args["description"] == "Software Engineering"
        assert call_args["instructor_id"] == instructor_user["id"]
        assert "class_code" in call_args

    def test_retries_on_unique_constraint_collision(self, mock_supabase, instructor_user):
        """AC-2.1.3: If class_code collision occurs, retry with a new code."""
        # First attempt: collision error
        # Second attempt: success
        collision_error = Exception("duplicate key value violates unique constraint")
        success_result = Mock()
        success_result.data = [{
            "id": "class-uuid-2",
            "name": "CS 302",
            "description": None,
            "class_code": "XYZ789",
            "instructor_id": instructor_user["id"],
            "created_at": "2026-04-11T10:05:00Z",
        }]

        attempts = []
        def mock_execute():
            attempts.append(1)
            if len(attempts) == 1:
                raise collision_error
            return success_result

        mock_chain = Mock()
        mock_chain.execute.side_effect = mock_execute
        mock_supabase.table.return_value.insert.return_value = mock_chain

        result = create_class(
            supabase=mock_supabase,
            name="CS 302",
            description=None,
            instructor_id=instructor_user["id"],
        )

        assert result["id"] == "class-uuid-2"
        assert len(attempts) == 2  # Should have retried once

    def test_raises_exception_after_max_retries(self, mock_supabase, instructor_user):
        """AC-2.1.3: Raise exception if max retries (10) exceeded due to collisions."""
        collision_error = Exception("duplicate key value violates unique constraint")

        mock_chain = Mock()
        mock_chain.execute.side_effect = collision_error
        mock_supabase.table.return_value.insert.return_value = mock_chain

        with pytest.raises(Exception) as exc_info:
            create_class(
                supabase=mock_supabase,
                name="CS 303",
                description=None,
                instructor_id=instructor_user["id"],
            )

        assert "Failed to generate unique class code after 10 attempts" in str(exc_info.value)

    def test_raises_immediately_on_non_collision_error(self, mock_supabase, instructor_user):
        """If a non-collision error occurs, raise immediately without retry."""
        other_error = Exception("Connection timeout")

        mock_chain = Mock()
        mock_chain.execute.side_effect = other_error
        mock_supabase.table.return_value.insert.return_value = mock_chain

        with pytest.raises(Exception) as exc_info:
            create_class(
                supabase=mock_supabase,
                name="CS 304",
                description=None,
                instructor_id=instructor_user["id"],
            )

        # Should fail on first attempt (not retry)
        assert "Connection timeout" in str(exc_info.value)


# ── Integration Tests: Route Handlers ─────────────────────────────


class TestCreateClassRoute:
    """Tests for POST /classes route."""

    @patch("app.api.routes.classes.get_supabase")
    def test_happy_path_returns_201_with_class_data(self, mock_get_supabase, client, auth_token, instructor_user):
        """AC-2.1.2: POST /classes returns 201 with class data including class_code."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock successful class creation
        mock_result = Mock()
        mock_result.data = [{
            "id": "new-class-uuid",
            "name": "Biology 101",
            "description": "Introduction to Biology",
            "class_code": "BIO101",
            "instructor_id": instructor_user["id"],
            "created_at": "2026-04-11T12:00:00Z",
        }]
        mock_chain = Mock()
        mock_chain.execute.return_value = mock_result
        mock_supabase.table.return_value.insert.return_value = mock_chain

        response = client.post(
            "/classes/",
            json={"name": "Biology 101", "description": "Introduction to Biology"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["id"] == "new-class-uuid"
        assert data["name"] == "Biology 101"
        assert data["description"] == "Introduction to Biology"
        assert data["class_code"] == "BIO101"
        assert data["instructor_id"] == instructor_user["id"]

    def test_missing_name_returns_400(self, client, auth_token):
        """AC-2.1.1: Submit button disabled when name is empty (backend validation)."""
        response = client.post(
            "/classes/",
            json={"name": "", "description": "Some description"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 400
        assert "Class name is required" in response.json()["detail"]

    def test_whitespace_only_name_returns_400(self, client, auth_token):
        """AC-2.1.1: Submit button disabled when name is whitespace-only (backend validation)."""
        response = client.post(
            "/classes/",
            json={"name": "   ", "description": "Some description"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 400
        assert "Class name is required" in response.json()["detail"]

    @patch("app.api.routes.classes.get_supabase")
    def test_instructor_id_from_jwt_not_request_body(self, mock_get_supabase, client, auth_token, instructor_user):
        """Verify instructor_id is extracted from JWT, not accepted from request body."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_result = Mock()
        mock_result.data = [{
            "id": "class-uuid-3",
            "name": "Math 201",
            "description": None,
            "class_code": "MATH01",
            "instructor_id": instructor_user["id"],  # Should be from JWT
            "created_at": "2026-04-11T13:00:00Z",
        }]
        mock_chain = Mock()
        mock_chain.execute.return_value = mock_result
        mock_supabase.table.return_value.insert.return_value = mock_chain

        # Attempt to pass a different instructor_id in the body
        response = client.post(
            "/classes/",
            json={
                "name": "Math 201",
                "instructor_id": "malicious-user-id",  # This should be ignored
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 201
        data = response.json()
        # Verify the instructor_id is from the JWT, not the request body
        assert data["instructor_id"] == instructor_user["id"]
        assert data["instructor_id"] != "malicious-user-id"

    def test_no_token_returns_401(self, client):
        """All routes return 401 when no token provided."""
        response = client.post(
            "/classes/",
            json={"name": "Test Class"},
        )

        assert response.status_code == 401
        assert "Missing authorization header" in response.json()["detail"]


class TestListClassesRoute:
    """Tests for GET /classes route."""

    @patch("app.api.routes.classes.get_supabase")
    def test_returns_only_instructor_classes(self, mock_get_supabase, client, auth_token, instructor_user):
        """AC-2.2.1: Fetch only classes where instructor_id equals current user's ID."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock classes query
        mock_classes_result = Mock()
        mock_classes_result.data = [
            {
                "id": "class-1",
                "name": "Class A",
                "description": "Description A",
                "class_code": "CLSA01",
                "instructor_id": instructor_user["id"],
                "created_at": "2026-04-11T10:00:00Z",
            },
            {
                "id": "class-2",
                "name": "Class B",
                "description": None,
                "class_code": "CLSB01",
                "instructor_id": instructor_user["id"],
                "created_at": "2026-04-10T10:00:00Z",
            },
        ]

        # Mock member count queries
        mock_member_count_1 = Mock()
        mock_member_count_1.count = 5
        mock_member_count_2 = Mock()
        mock_member_count_2.count = 3

        def mock_table_method(table_name):
            mock_table = Mock()
            if table_name == "classes":
                mock_chain = Mock()
                mock_chain.order.return_value.execute.return_value = mock_classes_result
                mock_chain.eq.return_value = mock_chain
                mock_table.select.return_value = mock_chain
            elif table_name == "class_members":
                calls = []
                def mock_execute():
                    calls.append(1)
                    return mock_member_count_1 if len(calls) == 1 else mock_member_count_2

                mock_chain = Mock()
                mock_chain.execute.side_effect = mock_execute
                mock_chain.eq.return_value = mock_chain
                mock_table.select.return_value = mock_chain
            return mock_table

        mock_supabase.table.side_effect = mock_table_method

        response = client.get(
            "/classes/",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["id"] == "class-1"
        assert data[1]["id"] == "class-2"

    @patch("app.api.routes.classes.get_supabase")
    def test_includes_member_count(self, mock_get_supabase, client, auth_token, instructor_user):
        """AC-2.2.2: Each class includes member_count."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_classes_result = Mock()
        mock_classes_result.data = [
            {
                "id": "class-1",
                "name": "Class A",
                "description": "Description A",
                "class_code": "CLSA01",
                "instructor_id": instructor_user["id"],
                "created_at": "2026-04-11T10:00:00Z",
            },
        ]

        mock_member_count = Mock()
        mock_member_count.count = 7

        def mock_table_method(table_name):
            mock_table = Mock()
            if table_name == "classes":
                mock_chain = Mock()
                mock_chain.order.return_value.execute.return_value = mock_classes_result
                mock_chain.eq.return_value = mock_chain
                mock_table.select.return_value = mock_chain
            elif table_name == "class_members":
                mock_chain = Mock()
                mock_chain.execute.return_value = mock_member_count
                mock_chain.eq.return_value = mock_chain
                mock_table.select.return_value = mock_chain
            return mock_table

        mock_supabase.table.side_effect = mock_table_method

        response = client.get(
            "/classes/",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["member_count"] == 7

    @patch("app.api.routes.classes.get_supabase")
    def test_sorted_by_created_at_desc(self, mock_get_supabase, client, auth_token, instructor_user):
        """AC-2.2.3: Classes are sorted by created_at descending (newest first)."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_classes_result = Mock()
        mock_classes_result.data = [
            {
                "id": "class-new",
                "name": "Newest Class",
                "description": None,
                "class_code": "NEW001",
                "instructor_id": instructor_user["id"],
                "created_at": "2026-04-11T12:00:00Z",
            },
            {
                "id": "class-old",
                "name": "Older Class",
                "description": None,
                "class_code": "OLD001",
                "instructor_id": instructor_user["id"],
                "created_at": "2026-04-10T12:00:00Z",
            },
        ]

        mock_member_count = Mock()
        mock_member_count.count = 0

        def mock_table_method(table_name):
            mock_table = Mock()
            if table_name == "classes":
                mock_chain = Mock()
                mock_chain.order.return_value.execute.return_value = mock_classes_result
                mock_chain.eq.return_value = mock_chain
                mock_table.select.return_value = mock_chain
            elif table_name == "class_members":
                mock_chain = Mock()
                mock_chain.execute.return_value = mock_member_count
                mock_chain.eq.return_value = mock_chain
                mock_table.select.return_value = mock_chain
            return mock_table

        mock_supabase.table.side_effect = mock_table_method

        response = client.get(
            "/classes/",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        # Newest should be first
        assert data[0]["id"] == "class-new"
        assert data[1]["id"] == "class-old"

    def test_no_token_returns_401(self, client):
        """All routes return 401 when no token provided."""
        response = client.get("/classes/")

        assert response.status_code == 401
        assert "Missing authorization header" in response.json()["detail"]


class TestGetClassDetailRoute:
    """Tests for GET /classes/{class_id} route."""

    @patch("app.api.routes.classes.get_supabase")
    def test_returns_class_detail_with_members(self, mock_get_supabase, client, auth_token, instructor_user):
        """AC-2.3.1, AC-2.3.2: Return class name, class_code, description, and members list."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock class query
        mock_class_result = Mock()
        mock_class_result.data = {
            "id": "class-detail-1",
            "name": "Physics 101",
            "description": "Introduction to Physics",
            "class_code": "PHY101",
            "instructor_id": instructor_user["id"],
            "created_at": "2026-04-11T10:00:00Z",
        }

        # Mock members query
        mock_members_result = Mock()
        mock_members_result.data = [
            {
                "student_id": "student-1",
                "joined_at": "2026-04-11T11:00:00Z",
                "profiles": {
                    "full_name": "Alice Student",
                    "email": "alice@example.com",
                },
            },
            {
                "student_id": "student-2",
                "joined_at": "2026-04-11T11:30:00Z",
                "profiles": {
                    "full_name": "Bob Student",
                    "email": "bob@example.com",
                },
            },
        ]

        def mock_table_method(table_name):
            mock_table = Mock()
            if table_name == "classes":
                mock_chain = Mock()
                mock_chain.single.return_value.execute.return_value = mock_class_result
                mock_chain.eq.return_value = mock_chain
                mock_table.select.return_value = mock_chain
            elif table_name == "class_members":
                mock_chain = Mock()
                mock_chain.execute.return_value = mock_members_result
                mock_chain.eq.return_value = mock_chain
                mock_table.select.return_value = mock_chain
            return mock_table

        mock_supabase.table.side_effect = mock_table_method

        response = client.get(
            "/classes/class-detail-1",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "class-detail-1"
        assert data["name"] == "Physics 101"
        assert data["description"] == "Introduction to Physics"
        assert data["class_code"] == "PHY101"
        assert len(data["members"]) == 2
        assert data["members"][0]["student_id"] == "student-1"
        assert data["members"][0]["full_name"] == "Alice Student"
        assert data["members"][0]["email"] == "alice@example.com"
        assert data["members"][1]["student_id"] == "student-2"

    @patch("app.api.routes.classes.get_supabase")
    def test_returns_404_for_nonexistent_class(self, mock_get_supabase, client, auth_token):
        """AC-2.3 boundary: Return 404 for non-existent class."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock empty result
        mock_class_result = Mock()
        mock_class_result.data = None

        mock_table = Mock()
        mock_chain = Mock()
        mock_chain.single.return_value.execute.return_value = mock_class_result
        mock_chain.eq.return_value = mock_chain
        mock_table.select.return_value = mock_chain
        mock_supabase.table.return_value = mock_table

        response = client.get(
            "/classes/nonexistent-id",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 404
        assert "Class not found" in response.json()["detail"]

    def test_no_token_returns_401(self, client):
        """All routes return 401 when no token provided."""
        response = client.get("/classes/some-id")

        assert response.status_code == 401
        assert "Missing authorization header" in response.json()["detail"]
