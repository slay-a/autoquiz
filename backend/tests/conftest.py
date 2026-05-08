"""Pytest configuration for backend tests."""

import sys
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

import jwt
from unittest.mock import MagicMock, patch
import pytest

from app.api.rate_limit import llm_rate_limiter


@pytest.fixture(autouse=True)
def _reset_llm_rate_limiter():
    """The LLM rate limiter is process-local; reset it between tests so
    cumulative /quiz/generate or /notes/generate calls across the suite
    don't trip the limit and turn unrelated tests into 429s."""
    llm_rate_limiter.reset()
    yield
    llm_rate_limiter.reset()


# ---------------------------------------------------------------------------
# Auth mock fixture
# ---------------------------------------------------------------------------
# After issue #37 fix, get_current_user calls supabase.auth.get_user(token).
# Integration tests that send a Bearer token signed with "test-secret" would
# fail at auth because the real Supabase instance cannot verify them.
#
# This autouse fixture patches app.api.dependencies.get_supabase for the
# duration of each test session. It inspects the token's JWT payload and
# returns a mock Supabase response that matches the claims — preserving the
# user_id / role that the test encoded, so the route sees the expected actor.
#
# Tests that need different Supabase behavior (service-layer patches, etc.)
# still work because this patch only targets the *dependencies* module and
# only for auth.get_user. Service-layer patches (app.services.*.get_supabase)
# are unaffected.
# ---------------------------------------------------------------------------

class _AuthMockGetUser:
    """Callable that decodes the token's payload (no sig check) and returns a mock user."""

    def __call__(self, token: str):
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
        except Exception:
            raise Exception("mock GoTrue: could not decode token")

        user_id = payload.get("sub")
        if not user_id:
            raise Exception("mock GoTrue: missing sub claim")

        email = payload.get("email", "test@example.com")
        role = (
            payload.get("user_metadata", {}).get("role")
            or payload.get("role")
            or "student"
        )

        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.email = email
        mock_user.user_metadata = {"role": role}

        mock_response = MagicMock()
        mock_response.user = mock_user
        return mock_response


@pytest.fixture(autouse=True)
def _mock_auth_get_supabase(request):
    """
    Autouse fixture: patch app.api.dependencies.get_supabase so that
    supabase.auth.get_user() decodes the test JWT without a real network call.

    Skipped for tests that explicitly opt-out by marking with:
        @pytest.mark.no_auth_mock
    """
    if request.node.get_closest_marker("no_auth_mock"):
        yield
        return

    mock_sb = MagicMock()
    mock_sb.auth.get_user.side_effect = _AuthMockGetUser()

    with patch("app.api.dependencies.get_supabase", return_value=mock_sb):
        yield mock_sb
