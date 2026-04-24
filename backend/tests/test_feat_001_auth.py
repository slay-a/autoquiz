"""
FEAT-001: Authentication & Session Management — Backend Tests

Covers BLOCKER-2 (error envelope compliance) and BLOCKER-3 (missing backend test coverage).

Tests for get_current_user dependency in backend/app/api/dependencies.py.
Per DESIGN.md §3.1.1, all non-2xx responses must use the standard error envelope:
  { "error": { "code": "UPPER_SNAKE_CASE", "message": "...", "request_id": "uuid" } }
Per DESIGN.md §3.1.2, AUTH_REQUIRED (401) must be the error code emitted.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import uuid
import jwt
import pytest
from fastapi import FastAPI, Depends, Request
from fastapi.testclient import TestClient

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


def _make_token(payload: dict) -> str:
    """Create an unsigned JWT (for testing only)."""
    return jwt.encode(payload, key="", algorithm="HS256")


# ---------------------------------------------------------------------------
# BLOCKER-3 + BLOCKER-2: Coverage of get_current_user scenarios
# ---------------------------------------------------------------------------


class TestGetCurrentUserMissingHeader:
    """
    AUTH_REQUIRED (401) when no Authorization header.
    BLOCKER-3: tests missing entirely before this file.
    BLOCKER-2: response must use the standard error envelope.
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
    """Bearer token present but JWT is malformed."""

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


class TestGetCurrentUserValidToken:
    """Valid (unsigned) Bearer token returns user dict."""

    def test_valid_token_returns_200(self):
        user_id = str(uuid.uuid4())
        token = _make_token({
            "sub": user_id,
            "email": "test@example.com",
            "user_metadata": {"role": "instructor"},
        })
        response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200

    def test_valid_token_returns_user_id(self):
        user_id = str(uuid.uuid4())
        token = _make_token({
            "sub": user_id,
            "email": "test@example.com",
            "user_metadata": {"role": "student"},
        })
        response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert response.json()["user_id"] == user_id

    def test_token_missing_sub_returns_401(self):
        """Token without 'sub' claim should return 401."""
        token = _make_token({"email": "test@example.com"})
        response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401

    def test_token_missing_sub_uses_standard_envelope(self):
        """DESIGN.md §3.1.1: missing sub must also use standard envelope."""
        token = _make_token({"email": "test@example.com"})
        response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        body = response.json()
        assert "error" in body, f"Expected standard envelope, got: {body}"
        assert body["error"]["code"] == "AUTH_REQUIRED"
        assert "request_id" in body["error"]
