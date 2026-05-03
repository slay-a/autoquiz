"""
FEAT-001: Authentication & Session Management — Backend Tests

Tests for get_current_user dependency in backend/app/api/dependencies.py.
Per DESIGN.md §3.1.1, all non-2xx responses must use the standard error envelope:
  { "error": { "code": "UPPER_SNAKE_CASE", "message": "...", "request_id": "uuid" } }
Per DESIGN.md §3.1.2, AUTH_REQUIRED (401) must be the error code emitted.
Per DESIGN.md §13.3.1, token verification is delegated to supabase.auth.get_user().
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import uuid
import pytest
from fastapi import FastAPI, Depends, Request
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.api.dependencies import get_current_user, _EnvelopeException


# ---------------------------------------------------------------------------
# Test FastAPI app — mirrors how main.py wires up the exception handler
# ---------------------------------------------------------------------------

test_app = FastAPI()


@test_app.exception_handler(_EnvelopeException)
async def envelope_exception_handler(request: Request, exc: _EnvelopeException):
    return exc.response


@test_app.get("/protected")
def protected_endpoint(current_user: dict = Depends(get_current_user)):
    return {"user_id": current_user["id"], "email": current_user["email"]}


client = TestClient(test_app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_supabase_accepts(user_id: str, email: str, role: str) -> MagicMock:
    """Return a mock Supabase client whose auth.get_user() succeeds."""
    mock_user = MagicMock()
    mock_user.id = user_id
    mock_user.email = email
    mock_user.user_metadata = {"role": role}

    mock_response = MagicMock()
    mock_response.user = mock_user

    mock_sb = MagicMock()
    mock_sb.auth.get_user.return_value = mock_response
    return mock_sb


def _mock_supabase_rejects(reason: str = "invalid JWT") -> MagicMock:
    """Return a mock Supabase client whose auth.get_user() raises an exception."""
    mock_sb = MagicMock()
    mock_sb.auth.get_user.side_effect = Exception(reason)
    return mock_sb


# ---------------------------------------------------------------------------
# BLOCKER-2: Coverage of get_current_user scenarios
# ---------------------------------------------------------------------------


class TestGetCurrentUserMissingHeader:
    """
    AUTH_REQUIRED (401) when no Authorization header.
    Response must use the standard error envelope.
    """

    def test_missing_auth_header_returns_401(self):
        """No Authorization header → 401."""
        response = client.get("/protected")
        assert response.status_code == 401

    def test_missing_auth_header_uses_standard_envelope(self):
        """
        DESIGN.md §3.1.1: error response must use the standard envelope.
        { "error": { "code": "AUTH_REQUIRED", "message": "...", "request_id": "<uuid>" } }
        """
        response = client.get("/protected")
        body = response.json()
        assert "error" in body, (
            f"Response must use standard envelope {{\"error\": ...}} but got: {body}"
        )
        error = body["error"]
        assert error["code"] == "AUTH_REQUIRED", (
            f"Expected code AUTH_REQUIRED, got: {error.get('code')}"
        )
        assert "message" in error
        assert "request_id" in error


class TestGetCurrentUserInvalidFormat:
    """Authorization header present but not 'Bearer <token>' format."""

    def test_invalid_format_returns_401(self):
        response = client.get("/protected", headers={"Authorization": "Basic abc123"})
        assert response.status_code == 401

    def test_invalid_format_uses_standard_envelope(self):
        """DESIGN.md §3.1.1: non-standard header format must use the error envelope."""
        response = client.get("/protected", headers={"Authorization": "Basic abc123"})
        body = response.json()
        assert "error" in body, (
            f"Response must use standard envelope but got: {body}"
        )
        error = body["error"]
        assert error["code"] == "AUTH_REQUIRED"
        assert "request_id" in error


class TestGetCurrentUserInvalidToken:
    """Bearer token present but JWT is malformed or rejected by GoTrue."""

    def test_invalid_jwt_returns_401(self):
        response = client.get("/protected", headers={"Authorization": "Bearer not.a.jwt"})
        assert response.status_code == 401

    def test_invalid_jwt_uses_standard_envelope(self):
        """DESIGN.md §3.1.1: invalid token response must use standard envelope."""
        response = client.get("/protected", headers={"Authorization": "Bearer not.a.jwt"})
        body = response.json()
        assert "error" in body, (
            f"Response must use standard envelope but got: {body}"
        )
        assert body["error"]["code"] == "AUTH_REQUIRED"
        assert "request_id" in body["error"]

    def test_goTrue_rejected_token_returns_401(self):
        """
        A structurally valid JWT that GoTrue rejects (e.g. wrong signature)
        must return 401, not 200. This covers BLOCKER-1 from issue #37.
        """
        mock_sb = _mock_supabase_rejects("invalid JWT: signature does not match")
        with patch("app.api.dependencies.get_supabase", return_value=mock_sb):
            response = client.get(
                "/protected",
                headers={"Authorization": "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.forged"},
            )
        assert response.status_code == 401

    def test_goTrue_rejected_token_uses_standard_envelope(self):
        """Standard envelope on GoTrue rejection."""
        mock_sb = _mock_supabase_rejects("invalid JWT")
        with patch("app.api.dependencies.get_supabase", return_value=mock_sb):
            response = client.get(
                "/protected",
                headers={"Authorization": "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.forged"},
            )
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "AUTH_REQUIRED"
        assert "request_id" in body["error"]


class TestGetCurrentUserValidToken:
    """Valid token accepted by GoTrue returns user dict."""

    def test_valid_token_returns_200(self):
        user_id = str(uuid.uuid4())
        mock_sb = _mock_supabase_accepts(user_id, "test@example.com", "instructor")
        with patch("app.api.dependencies.get_supabase", return_value=mock_sb):
            response = client.get(
                "/protected",
                headers={"Authorization": "Bearer valid.token.here"},
            )
        assert response.status_code == 200

    def test_valid_token_returns_user_id(self):
        user_id = str(uuid.uuid4())
        mock_sb = _mock_supabase_accepts(user_id, "test@example.com", "student")
        with patch("app.api.dependencies.get_supabase", return_value=mock_sb):
            response = client.get(
                "/protected",
                headers={"Authorization": "Bearer valid.token.here"},
            )
        assert response.json()["user_id"] == user_id

    def test_token_with_null_user_returns_401(self):
        """GoTrue returning None user must return 401."""
        mock_response = MagicMock()
        mock_response.user = None
        mock_sb = MagicMock()
        mock_sb.auth.get_user.return_value = mock_response

        with patch("app.api.dependencies.get_supabase", return_value=mock_sb):
            response = client.get(
                "/protected",
                headers={"Authorization": "Bearer some.token.here"},
            )
        assert response.status_code == 401

    def test_token_with_null_user_uses_standard_envelope(self):
        """DESIGN.md §3.1.1: null user response must use standard envelope."""
        mock_response = MagicMock()
        mock_response.user = None
        mock_sb = MagicMock()
        mock_sb.auth.get_user.return_value = mock_response

        with patch("app.api.dependencies.get_supabase", return_value=mock_sb):
            response = client.get(
                "/protected",
                headers={"Authorization": "Bearer some.token.here"},
            )
        body = response.json()
        assert "error" in body, f"Expected standard envelope, got: {body}"
        assert body["error"]["code"] == "AUTH_REQUIRED"
        assert "request_id" in body["error"]
