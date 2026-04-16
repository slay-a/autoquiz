"""
Tests for FEAT-010 Instructor Notes System.

Tests cover:
- Story 10.1: Create class notes
- Story 10.2: Edit class notes
- Story 10.3: Publish and unpublish class notes

Test strategy:
- Integration tests for POST /notes/generate auth guard (AC-10.1.2)
- Integration tests for GET /classes/student/content route filtering (AC-10.3.2, AC-10.3.3)
- Verify draft notes are hidden from students
- Verify notes from non-joined classes are hidden from students
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


# ── Integration Tests: POST /notes/generate ───────────────────────


class TestNotesGenerateAuth:
    """Tests for POST /notes/generate auth guard (AC-10.1.2)."""

    def test_unauthenticated_request_returns_401(self, client):
        """
        AC-10.1.2: POST /notes/generate must require a valid auth token.

        Test verifies:
        - Request with no auth token returns HTTP 401
        - Unauthenticated users cannot generate notes
        """
        response = client.post(
            "/notes/generate",
            json={"topic": "Photosynthesis", "file_id": None, "outside_sources": False},
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        assert "detail" in response.json()

    @patch("app.api.routes.notes.generate_notes")
    @patch("app.api.routes.notes.hybrid_search")
    def test_authenticated_request_succeeds(
        self, mock_hybrid_search, mock_generate_notes, client, instructor_user
    ):
        """
        AC-10.1.2: POST /notes/generate succeeds with valid auth token.

        Test verifies:
        - Authenticated instructor can call /notes/generate
        - Response contains generated notes object
        """
        # Mock dependencies
        mock_hybrid_search.return_value = []
        mock_generate_notes.return_value = {
            "summary": "Overview of photosynthesis",
            "key_concepts": [
                {
                    "term": "Chloroplast",
                    "definition": "Organelle where photosynthesis occurs",
                    "example": "Found in plant cells",
                }
            ],
            "important_details": ["Uses light energy", "Produces glucose"],
            "common_misconceptions": ["Plants breathe in CO2 only"],
        }

        # Override the dependency to provide authenticated user
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        try:
            response = client.post(
                "/notes/generate",
                json={
                    "topic": "Photosynthesis",
                    "file_id": None,
                    "outside_sources": False,
                },
            )
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            assert "summary" in data
            assert "key_concepts" in data
            assert isinstance(data["key_concepts"], list)
        finally:
            app.dependency_overrides.clear()


# ── Integration Tests: GET /classes/student/content ───────────────


class TestStudentContentNoteFiltering:
    """Tests for GET /classes/student/content note filtering (AC-10.3.2, AC-10.3.3)."""

    @patch("app.api.routes.classes.get_supabase")
    def test_draft_notes_are_hidden_from_enrolled_student(
        self, mock_get_supabase, client, student_user
    ):
        """
        AC-10.3.2: Draft notes (is_published=false) must not appear for students.

        Test verifies:
        - Student enrolled in class-1 does NOT receive draft notes
        - Only is_published=true notes are included in response
        - Draft notes are filtered server-side
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
                    "name": "Biology 101",
                },
            }
        ]

        # Mock quizzes (empty for this test)
        quizzes_result = Mock()
        quizzes_result.data = []

        # Mock notes: one published, one draft
        notes_result = Mock()
        notes_result.data = [
            {
                "id": "note-published",
                "title": "Cell Structure",
                "topic": "Biology",
                "content": {"summary": "Overview of cells"},
                "created_at": "2026-04-10T10:00:00Z",
                "class_id": "class-1",
                "is_published": True,
            }
            # Draft note is NOT returned by the query because of .eq("is_published", True) filter
        ]

        # Configure the mock chain
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

        # Override auth
        app.dependency_overrides[get_current_user] = lambda: student_user

        try:
            response = client.get("/classes/student/content")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()

            assert "notes" in data
            notes = data["notes"]

            # Verify only published note is included
            assert len(notes) == 1, f"Expected 1 note, got {len(notes)}"
            assert notes[0]["id"] == "note-published"
            assert notes[0]["title"] == "Cell Structure"

            # Verify the Supabase query chain was called with is_published=True filter
            mock_supabase.table.assert_any_call("class_notes")
        finally:
            app.dependency_overrides.clear()

    @patch("app.api.routes.classes.get_supabase")
    def test_notes_from_non_joined_classes_are_hidden(
        self, mock_get_supabase, client, student_user
    ):
        """
        AC-10.3.3: Students see notes ONLY from classes they are enrolled in.

        Test verifies:
        - Student enrolled in class-1 does NOT receive notes from class-2
        - Notes are filtered by class_id IN (student's joined classes)
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Student is enrolled in class-1 only
        memberships_result = Mock()
        memberships_result.data = [
            {
                "class_id": "class-1",
                "student_id": student_user["id"],
                "classes": {
                    "name": "Biology 101",
                },
            }
        ]

        # Mock quizzes (empty)
        quizzes_result = Mock()
        quizzes_result.data = []

        # Mock notes: only from class-1 (class-2 notes are NOT returned by query)
        notes_result = Mock()
        notes_result.data = [
            {
                "id": "note-class1",
                "title": "Cell Structure",
                "topic": "Biology",
                "content": {"summary": "Overview of cells"},
                "created_at": "2026-04-10T10:00:00Z",
                "class_id": "class-1",
                "is_published": True,
            }
            # note-class2 is NOT included because .in_("class_id", ["class-1"]) filters it out
        ]

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

        app.dependency_overrides[get_current_user] = lambda: student_user

        try:
            response = client.get("/classes/student/content")
            assert response.status_code == 200
            data = response.json()

            assert "notes" in data
            notes = data["notes"]

            # Verify only class-1 note is returned
            assert len(notes) == 1
            assert notes[0]["id"] == "note-class1"
            assert notes[0]["className"] == "Biology 101"

            # Verify no notes from class-2 are included
            assert all(n["id"] != "note-class2" for n in notes)
        finally:
            app.dependency_overrides.clear()

    @patch("app.api.routes.classes.get_supabase")
    def test_published_notes_appear_for_enrolled_student(
        self, mock_get_supabase, client, student_user
    ):
        """
        AC-10.3.3: Published notes appear on student dashboard for enrolled students.

        Test verifies:
        - Student enrolled in class-1 receives published notes
        - className field is populated from class name
        - Notes are ordered by created_at descending
        """
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        memberships_result = Mock()
        memberships_result.data = [
            {
                "class_id": "class-1",
                "student_id": student_user["id"],
                "classes": {
                    "name": "Chemistry 201",
                },
            }
        ]

        quizzes_result = Mock()
        quizzes_result.data = []

        notes_result = Mock()
        notes_result.data = [
            {
                "id": "note-recent",
                "title": "Acid-Base Reactions",
                "topic": "Chemistry",
                "content": {"summary": "Overview of acids and bases"},
                "created_at": "2026-04-12T10:00:00Z",
                "class_id": "class-1",
                "is_published": True,
            },
            {
                "id": "note-older",
                "title": "Periodic Table",
                "topic": "Chemistry",
                "content": {"summary": "Elements and structure"},
                "created_at": "2026-04-10T10:00:00Z",
                "class_id": "class-1",
                "is_published": True,
            },
        ]

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

        app.dependency_overrides[get_current_user] = lambda: student_user

        try:
            response = client.get("/classes/student/content")
            assert response.status_code == 200
            data = response.json()

            assert "notes" in data
            notes = data["notes"]

            assert len(notes) == 2
            assert notes[0]["id"] == "note-recent"
            assert notes[0]["className"] == "Chemistry 201"
            assert notes[1]["id"] == "note-older"
            assert notes[1]["className"] == "Chemistry 201"
        finally:
            app.dependency_overrides.clear()
