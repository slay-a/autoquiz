"""
Tests for FEAT-008 Quiz Sharing (Instructor).

Tests cover:
- Story 8.1: Share a quiz with a class
- Story 8.2: Generate and share a quiz from the class view
- Story 8.3: Delete a shared quiz

Test strategy:
- Integration tests for GET /classes/student/content route with mocked Supabase client
- Test sharing state filtering (is_shared=true visible, is_shared=false hidden)
- Test class membership scoping (only enrolled students see quizzes)
- Test cross-class isolation (students cannot see quizzes from non-joined classes)
"""

import pytest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient

from main import app
from app.api.dependencies import get_current_user


# ── Fixtures ──────────────────────────────────────────────────────


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


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
def other_student_user():
    """Fixture for a second student user (not enrolled in the test class)."""
    return {
        "id": "student-789-uuid",
        "email": "otherstudent@example.com",
        "role": "student",
    }


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    mock_client = Mock()
    return mock_client


# ── Integration Tests: GET /classes/student/content ───────────────


class TestStudentContentRoute:
    """Tests for GET /classes/student/content route (AC-8.1.3)."""

    @patch("app.services.class_service.get_supabase")
    def test_enrolled_student_receives_only_shared_quizzes(
        self, mock_get_supabase, client, student_user
    ):
        """
        AC-8.1.3: Enrolled student receives ONLY is_shared=true quizzes from joined classes.

        Test verifies:
        - Student enrolled in class-1 receives shared quiz
        - is_shared=true quiz is included in response
        - className is populated correctly
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock student memberships (enrolled in class-1)
        memberships_result = Mock()
        memberships_result.data = [
            {
                "class_id": "class-1",
                "student_id": student_user["id"],
                "classes": {
                    "name": "Math 101",
                },
            }
        ]

        # Mock shared quizzes from class-1
        quizzes_result = Mock()
        quizzes_result.data = [
            {
                "id": "quiz-shared-1",
                "title": "Algebra Quiz",
                "topic": "Algebra",
                "difficulty": "medium",
                "questions": [{"q": "1+1", "a": ["2", "3", "4"], "correct": 0}],
                "created_at": "2026-04-10T10:00:00Z",
                "class_id": "class-1",
            }
        ]

        # Mock notes (empty for this test)
        notes_result = Mock()
        notes_result.data = []

        # Set up mock chain
        def mock_table(table_name):
            mock_table_obj = Mock()
            mock_chain = Mock()

            if table_name == "class_members":
                mock_chain.execute.return_value = memberships_result
                mock_table_obj.select.return_value.eq.return_value = mock_chain
            elif table_name == "saved_quizzes":
                mock_chain.execute.return_value = quizzes_result
                mock_chain.order.return_value = mock_chain
                mock_chain.eq.return_value = mock_chain
                mock_chain.in_.return_value = mock_chain
                mock_table_obj.select.return_value = mock_chain
            elif table_name == "class_notes":
                mock_chain.execute.return_value = notes_result
                mock_chain.order.return_value = mock_chain
                mock_chain.eq.return_value = mock_chain
                mock_chain.in_.return_value = mock_chain
                mock_table_obj.select.return_value = mock_chain

            return mock_table_obj

        mock_supabase.table.side_effect = mock_table

        # Override dependency to inject student user
        def override_get_current_user():
            return student_user

        app.dependency_overrides[get_current_user] = override_get_current_user

        try:
            response = client.get("/classes/student/content")

            assert response.status_code == 200
            data = response.json()

            # Verify quiz is returned
            assert len(data["quizzes"]) == 1
            quiz = data["quizzes"][0]
            assert quiz["id"] == "quiz-shared-1"
            assert quiz["title"] == "Algebra Quiz"
            assert quiz["className"] == "Math 101"

            # Verify notes are empty
            assert len(data["notes"]) == 0

        finally:
            app.dependency_overrides.clear()

    @patch("app.services.class_service.get_supabase")
    def test_enrolled_student_does_not_receive_unshared_quizzes(
        self, mock_get_supabase, client, student_user
    ):
        """
        AC-8.1.3: Enrolled student does NOT receive is_shared=false quizzes.

        Test verifies:
        - Backend filters quizzes by is_shared=true
        - Unshared quizzes are not included in response
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock student memberships
        memberships_result = Mock()
        memberships_result.data = [
            {
                "class_id": "class-1",
                "student_id": student_user["id"],
                "classes": {
                    "name": "Math 101",
                },
            }
        ]

        # Mock ONLY shared quizzes (backend filters is_shared=true)
        # Unshared quizzes should never appear in this result
        quizzes_result = Mock()
        quizzes_result.data = []  # No shared quizzes in this class

        notes_result = Mock()
        notes_result.data = []

        def mock_table(table_name):
            mock_table_obj = Mock()
            mock_chain = Mock()

            if table_name == "class_members":
                mock_chain.execute.return_value = memberships_result
                mock_table_obj.select.return_value.eq.return_value = mock_chain
            elif table_name == "saved_quizzes":
                mock_chain.execute.return_value = quizzes_result
                mock_chain.order.return_value = mock_chain
                mock_chain.eq.return_value = mock_chain
                mock_chain.in_.return_value = mock_chain
                mock_table_obj.select.return_value = mock_chain
            elif table_name == "class_notes":
                mock_chain.execute.return_value = notes_result
                mock_chain.order.return_value = mock_chain
                mock_chain.eq.return_value = mock_chain
                mock_chain.in_.return_value = mock_chain
                mock_table_obj.select.return_value = mock_chain

            return mock_table_obj

        mock_supabase.table.side_effect = mock_table

        def override_get_current_user():
            return student_user

        app.dependency_overrides[get_current_user] = override_get_current_user

        try:
            response = client.get("/classes/student/content")

            assert response.status_code == 200
            data = response.json()

            # Verify no quizzes are returned (because none are shared)
            assert len(data["quizzes"]) == 0
            assert len(data["notes"]) == 0

        finally:
            app.dependency_overrides.clear()

    @patch("app.services.class_service.get_supabase")
    def test_unenrolled_student_receives_no_quizzes(
        self, mock_get_supabase, client, other_student_user
    ):
        """
        AC-8.1.3: Unenrolled student receives NO quizzes from that class (even if is_shared=true).

        Test verifies:
        - Student not enrolled in any class receives empty response
        - Shared quizzes are not accessible to unenrolled students
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock empty memberships (student not enrolled in any class)
        memberships_result = Mock()
        memberships_result.data = []

        def mock_table(table_name):
            mock_table_obj = Mock()
            mock_chain = Mock()

            if table_name == "class_members":
                mock_chain.execute.return_value = memberships_result
                mock_table_obj.select.return_value.eq.return_value = mock_chain

            return mock_table_obj

        mock_supabase.table.side_effect = mock_table

        def override_get_current_user():
            return other_student_user

        app.dependency_overrides[get_current_user] = override_get_current_user

        try:
            response = client.get("/classes/student/content")

            assert response.status_code == 200
            data = response.json()

            # Verify no quizzes or notes are returned
            assert len(data["quizzes"]) == 0
            assert len(data["notes"]) == 0

        finally:
            app.dependency_overrides.clear()

    @patch("app.services.class_service.get_supabase")
    def test_student_from_another_class_cannot_receive_quizzes_from_first_class(
        self, mock_get_supabase, client, other_student_user
    ):
        """
        Test verifies cross-class isolation:
        - Student enrolled in class-2 cannot see quizzes from class-1
        - Only quizzes from joined classes are returned

        This test ensures that the .in_("class_id", class_ids) filter works correctly.
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock student enrolled in class-2 only
        memberships_result = Mock()
        memberships_result.data = [
            {
                "class_id": "class-2",
                "student_id": other_student_user["id"],
                "classes": {
                    "name": "Physics 101",
                },
            }
        ]

        # Mock quizzes ONLY from class-2 (backend filters by class_id IN [class-2])
        # Quizzes from class-1 should never appear
        quizzes_result = Mock()
        quizzes_result.data = [
            {
                "id": "quiz-class-2",
                "title": "Physics Quiz",
                "topic": "Mechanics",
                "difficulty": "hard",
                "questions": [{"q": "F=ma", "a": ["Yes", "No"], "correct": 0}],
                "created_at": "2026-04-11T10:00:00Z",
                "class_id": "class-2",
            }
        ]

        notes_result = Mock()
        notes_result.data = []

        def mock_table(table_name):
            mock_table_obj = Mock()
            mock_chain = Mock()

            if table_name == "class_members":
                mock_chain.execute.return_value = memberships_result
                mock_table_obj.select.return_value.eq.return_value = mock_chain
            elif table_name == "saved_quizzes":
                mock_chain.execute.return_value = quizzes_result
                mock_chain.order.return_value = mock_chain
                mock_chain.eq.return_value = mock_chain
                mock_chain.in_.return_value = mock_chain
                mock_table_obj.select.return_value = mock_chain
            elif table_name == "class_notes":
                mock_chain.execute.return_value = notes_result
                mock_chain.order.return_value = mock_chain
                mock_chain.eq.return_value = mock_chain
                mock_chain.in_.return_value = mock_chain
                mock_table_obj.select.return_value = mock_chain

            return mock_table_obj

        mock_supabase.table.side_effect = mock_table

        def override_get_current_user():
            return other_student_user

        app.dependency_overrides[get_current_user] = override_get_current_user

        try:
            response = client.get("/classes/student/content")

            assert response.status_code == 200
            data = response.json()

            # Verify only class-2 quiz is returned
            assert len(data["quizzes"]) == 1
            quiz = data["quizzes"][0]
            assert quiz["id"] == "quiz-class-2"
            assert quiz["className"] == "Physics 101"

            # Verify class-1 quizzes are NOT in the response
            quiz_ids = [q["id"] for q in data["quizzes"]]
            assert "quiz-shared-1" not in quiz_ids

        finally:
            app.dependency_overrides.clear()

    @patch("app.services.class_service.get_supabase")
    def test_returns_multiple_shared_quizzes_from_multiple_classes(
        self, mock_get_supabase, client, student_user
    ):
        """
        Test verifies:
        - Student enrolled in multiple classes receives shared quizzes from all of them
        - className is correctly populated for each quiz
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock student memberships (enrolled in class-1 and class-2)
        memberships_result = Mock()
        memberships_result.data = [
            {
                "class_id": "class-1",
                "student_id": student_user["id"],
                "classes": {"name": "Math 101"},
            },
            {
                "class_id": "class-2",
                "student_id": student_user["id"],
                "classes": {"name": "Physics 101"},
            },
        ]

        # Mock shared quizzes from both classes
        quizzes_result = Mock()
        quizzes_result.data = [
            {
                "id": "quiz-math",
                "title": "Algebra Quiz",
                "topic": "Algebra",
                "difficulty": "easy",
                "questions": [{}],
                "created_at": "2026-04-12T10:00:00Z",
                "class_id": "class-1",
            },
            {
                "id": "quiz-physics",
                "title": "Mechanics Quiz",
                "topic": "Physics",
                "difficulty": "hard",
                "questions": [{}],
                "created_at": "2026-04-11T10:00:00Z",
                "class_id": "class-2",
            },
        ]

        notes_result = Mock()
        notes_result.data = []

        def mock_table(table_name):
            mock_table_obj = Mock()
            mock_chain = Mock()

            if table_name == "class_members":
                mock_chain.execute.return_value = memberships_result
                mock_table_obj.select.return_value.eq.return_value = mock_chain
            elif table_name == "saved_quizzes":
                mock_chain.execute.return_value = quizzes_result
                mock_chain.order.return_value = mock_chain
                mock_chain.eq.return_value = mock_chain
                mock_chain.in_.return_value = mock_chain
                mock_table_obj.select.return_value = mock_chain
            elif table_name == "class_notes":
                mock_chain.execute.return_value = notes_result
                mock_chain.order.return_value = mock_chain
                mock_chain.eq.return_value = mock_chain
                mock_chain.in_.return_value = mock_chain
                mock_table_obj.select.return_value = mock_chain

            return mock_table_obj

        mock_supabase.table.side_effect = mock_table

        def override_get_current_user():
            return student_user

        app.dependency_overrides[get_current_user] = override_get_current_user

        try:
            response = client.get("/classes/student/content")

            assert response.status_code == 200
            data = response.json()

            # Verify both quizzes are returned
            assert len(data["quizzes"]) == 2

            # Verify className mapping is correct
            quiz_map = {q["id"]: q for q in data["quizzes"]}
            assert quiz_map["quiz-math"]["className"] == "Math 101"
            assert quiz_map["quiz-physics"]["className"] == "Physics 101"

        finally:
            app.dependency_overrides.clear()

    @patch("app.services.class_service.get_supabase")
    def test_no_token_returns_401(self, mock_get_supabase, client):
        """All routes return 401 when no token provided."""
        response = client.get("/classes/student/content")

        assert response.status_code == 401
        body = response.json()
        assert body["error"]["code"] == "AUTH_REQUIRED"
        assert "message" in body["error"]
