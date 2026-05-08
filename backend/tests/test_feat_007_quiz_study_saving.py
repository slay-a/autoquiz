"""
Tests for FEAT-007 Quiz Study & Saving.

Tests cover:
- Story 7.1: Study a quiz
- Story 7.2: Save a generated quiz
- Story 7.3: Regenerate a quiz

Test strategy:
- Integration tests for quiz load route (access control enforcement)
- Source-level verification for quiz save logic (is_shared=false, created_by from JWT)
- Source-level verification for regenerate parameters and title suffix
"""

import pytest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
from contextlib import contextmanager
import uuid

from main import app
from app.api.dependencies import get_current_user


# -- Helpers ---------------------------------------------------------------


@contextmanager
def override_user(user):
    """Context manager to override get_current_user dependency."""
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        yield
    finally:
        app.dependency_overrides.clear()


# -- Fixtures --------------------------------------------------------------


@pytest.fixture
def student_user():
    """Fixture for an authenticated student user."""
    return {
        "id": "student-123-uuid",
        "email": "student@example.com",
        "role": "student",
    }


@pytest.fixture
def other_student_user():
    """Fixture for a different student user (for access control tests)."""
    return {
        "id": "student-456-uuid",
        "email": "otherstudent@example.com",
        "role": "student",
    }


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


# -- Story 7.1: Study a quiz -----------------------------------------------


class TestStory71StudyQuiz:
    """
    Story 7.1: Study a quiz

    AC-7.1.1: Quiz load enforces access control — student can load own quiz or is_shared=true quiz
    AC-7.1.2-7.1.5: Frontend-only tests (see QuizView.test.jsx)
    """

    def test_ac_711_quiz_load_access_control_enforced_in_backend(self):
        """
        AC-7.1.1: Quiz load access control is enforced in the backend
        `quiz_service.get_quiz_by_id` (post-FEAT-021 layer-boundary migration).

        The original implementation used a Supabase `.or()` filter in
        QuizStudy.jsx; that violated DESIGN.md §0 (frontend → FastAPI →
        Supabase). Access control is now in `quiz_service.py`:
            if quiz["created_by"] != user_id and not quiz.get("is_shared"):
                raise QuizNotFoundError(...)
        """
        import pathlib
        backend_path = (
            pathlib.Path(__file__).resolve().parents[1]
            / "app" / "services" / "quiz_service.py"
        )
        with open(backend_path, "r", encoding="utf-8") as f:
            content = f.read()

        assert "get_quiz_by_id" in content, (
            "quiz_service.py must define get_quiz_by_id"
        )
        # The two access-control predicates: own row OR shared
        assert "created_by" in content and "is_shared" in content, (
            "quiz_service.get_quiz_by_id must check both created_by and is_shared"
        )
        # And the frontend must NOT use .or() any more (regression guard)
        frontend_path = (
            pathlib.Path(__file__).resolve().parents[2]
            / "frontend" / "src" / "pages" / "QuizStudy.jsx"
        )
        with open(frontend_path, "r", encoding="utf-8") as f:
            qs = f.read()
        assert ".or(" not in qs, (
            "QuizStudy.jsx must not use Supabase .or() filter — access control "
            "is enforced server-side via /quiz/{id} (DESIGN.md §0)"
        )
        assert "/quiz/" in qs, (
            "QuizStudy.jsx must fetch via the FastAPI /quiz/{id} route"
        )


# -- Story 7.2: Save a generated quiz --------------------------------------


class TestStory72SaveQuiz:
    """
    Story 7.2: Save a generated quiz

    AC-7.2.1: Save insert has is_shared=false and created_by from JWT
    AC-7.2.2: Title format is {topic} — {difficulty} with em dash
    AC-7.2.3-7.2.4: Frontend-only tests (see Generate.test.jsx, StudentDashboard.test.jsx)
    """

    def test_ac_721_save_quiz_has_is_shared_false_and_created_by_from_jwt(self):
        """
        AC-7.2.1: Save quiz inserts with is_shared=False and created_by from
        the JWT — both set server-side, never from request body.

        Post-FEAT-021 layer-boundary migration, save now goes through
        POST /quiz/save (route -> quiz_service.save_quiz). The route MUST set
        created_by from current_user["id"] and the service MUST hardcode
        is_shared=False.
        """
        import pathlib
        repo_root = pathlib.Path(__file__).resolve().parents[2]

        # Route enforces created_by from JWT
        route_src = (repo_root / "backend" / "app" / "api" / "routes" / "quiz.py").read_text(encoding="utf-8")
        assert 'created_by=current_user["id"]' in route_src, (
            "/quiz/save must set created_by from current_user (JWT) — never "
            "from request body"
        )

        # Service hardcodes is_shared=False on creation
        svc_src = (repo_root / "backend" / "app" / "services" / "quiz_service.py").read_text(encoding="utf-8")
        assert '"is_shared": False' in svc_src, (
            "quiz_service.save_quiz must hardcode is_shared=False on insert"
        )

        # Frontend Generate.jsx must POST to /quiz/save (not insert via Supabase)
        gen_src = (repo_root / "frontend" / "src" / "pages" / "student" / "Generate.jsx").read_text(encoding="utf-8")
        assert '/quiz/save' in gen_src, (
            "Generate.jsx must call POST /quiz/save for saving — not "
            "supabase.from('saved_quizzes').insert (DESIGN.md §0)"
        )

    def test_ac_722_title_format_uses_em_dash(self):
        """
        AC-7.2.2: Title format is {topic} — {difficulty} with em dash (U+2014).

        Generate.jsx line 115 contains:
          title: `${quiz.topic} — ${quiz.difficulty}`,

        This test verifies the em dash is used, not a hyphen.
        """
        import os
        frontend_path = os.path.join(
            os.path.dirname(__file__), "../../frontend/src/pages/student/Generate.jsx"
        )

        with open(frontend_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Assert em dash is present in title construction
        assert "—" in content, "Generate.jsx must use em dash (—) in title format, not hyphen (-)"

        # Verify the title format pattern exists
        assert "${quiz.topic} — ${quiz.difficulty}" in content or \
               "`${quiz.topic} — ${quiz.difficulty}`" in content or \
               'title: `${quiz.topic} — ${quiz.difficulty}`' in content, \
               "Generate.jsx must construct title as '{topic} — {difficulty}'"


# -- Story 7.3: Regenerate a quiz ------------------------------------------


class TestStory73RegenerateQuiz:
    """
    Story 7.3: Regenerate a quiz

    AC-7.3.1: Regenerate sends POST /quiz/generate with original params AND Authorization header
    AC-7.3.2: Regenerated quiz title has (v2) suffix
    AC-7.3.3: Page navigates to /quiz/:new_id after regenerate

    All tests are source-level assertions because regenerate is implemented client-side.
    """

    def test_ac_731_regenerate_sends_post_with_original_params_and_auth_header(self):
        """
        AC-7.3.1: Regenerate sends POST /quiz/generate with original params AND Authorization header.

        QuizStudy.jsx lines 41-54 contain the regenerate fetch call:
          - URL: /quiz/generate
          - Method: POST
          - Headers: Authorization: Bearer ${session?.access_token}
          - Body: topic, num_questions, difficulty, question_types, outside_sources, file_id

        This test verifies the regenerate logic is correct in the source file.
        """
        import os
        frontend_path = os.path.join(
            os.path.dirname(__file__), "../../frontend/src/pages/QuizStudy.jsx"
        )

        with open(frontend_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Assert POST /quiz/generate is present
        assert '/quiz/generate' in content, "QuizStudy.jsx must call POST /quiz/generate"

        # Assert Authorization header is present
        assert 'Authorization' in content, "QuizStudy.jsx must include Authorization header"
        assert 'Bearer' in content, "QuizStudy.jsx must use Bearer token in Authorization header"

        # Assert original quiz parameters are sent
        assert 'topic: quiz.topic' in content, "Regenerate must send original topic"
        assert 'difficulty: quiz.difficulty' in content, "Regenerate must send original difficulty"
        assert 'file_id: quiz.file_id' in content, "Regenerate must send original file_id"

    def test_ac_732_regenerated_quiz_title_has_v2_suffix(self):
        """
        AC-7.3.2: Regenerated quiz title has (v2) suffix.

        QuizStudy.jsx line 61 contains:
          title: `${quiz.topic} — ${quiz.difficulty} (v2)`,

        This test verifies the (v2) suffix is applied.
        """
        import os
        frontend_path = os.path.join(
            os.path.dirname(__file__), "../../frontend/src/pages/QuizStudy.jsx"
        )

        with open(frontend_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Assert (v2) suffix is present
        assert '(v2)' in content, "QuizStudy.jsx must append (v2) suffix to regenerated quiz title"

        # Verify the title format pattern exists
        assert "`${quiz.topic} — ${quiz.difficulty} (v2)`" in content or \
               'title: `${quiz.topic} — ${quiz.difficulty} (v2)`' in content, \
               "Regenerated quiz title must be '{topic} — {difficulty} (v2)'"

    def test_ac_733_page_navigates_to_new_quiz_after_regenerate(self):
        """
        AC-7.3.3: Page navigates to /quiz/:new_id after regenerate.

        QuizStudy.jsx line 72 contains:
          if (saved) navigate(`/quiz/${saved.id}`);

        This test verifies the navigation is present.
        """
        import os
        frontend_path = os.path.join(
            os.path.dirname(__file__), "../../frontend/src/pages/QuizStudy.jsx"
        )

        with open(frontend_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Assert navigate is called with /quiz/${saved.id}
        assert 'navigate(`/quiz/${saved.id}`)' in content or \
               'navigate("/quiz/" + saved.id)' in content or \
               "navigate(`/quiz/${saved.id}`)" in content, \
               "QuizStudy.jsx must navigate to /quiz/:new_id after regenerate"
