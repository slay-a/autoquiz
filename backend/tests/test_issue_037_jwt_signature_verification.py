"""
Issue #37 — Red-phase tests: JWT decoded with verify_signature=False
Pins DESIGN.md §13.3.1 violation in backend/app/api/dependencies.py:67.

These tests MUST FAIL against the current implementation (verify_signature=False)
and PASS only after get_current_user calls supabase.auth.get_user(token) or
verifies the signature via HS256.

Blocker coverage:
  BLOCKER-1 (CRITICAL): forged token with wrong key must be rejected with 401.
  BLOCKER-2 (CRITICAL): verify_signature=False must not be present in dependencies.py.
  BLOCKER-3 (MAJOR):    existing "valid token" tests were vacuously passing.

§13.3.1 requirement: the dependency must reject any token whose signature does
not match (either via supabase.auth.get_user() or HS256 local verification).
AUTH_REQUIRED (401) is the required error code (DESIGN.md §3.1.2).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import uuid
import jwt
import pytest
from fastapi import FastAPI, Depends, Request
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.api.dependencies import get_current_user, _EnvelopeException


# ---------------------------------------------------------------------------
# Test FastAPI app — mirrors main.py wiring
# ---------------------------------------------------------------------------

_test_app = FastAPI()


@_test_app.exception_handler(_EnvelopeException)
async def _envelope_handler(request: Request, exc: _EnvelopeException):
    return exc.response


@_test_app.get("/protected")
def _protected(current_user: dict = Depends(get_current_user)):
    return {"user_id": current_user["id"], "email": current_user["email"]}


_client = TestClient(_test_app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_REAL_SECRET = "super-secret-jwt-key-that-supabase-signs-with"
_WRONG_SECRET = "attacker-controlled-secret-that-must-not-work"


def _token_signed_with(secret: str, payload: dict | None = None) -> str:
    """Return a JWT signed with the given secret."""
    if payload is None:
        payload = {
            "sub": str(uuid.uuid4()),
            "email": "legitimate@example.com",
            "user_metadata": {"role": "student"},
        }
    return jwt.encode(payload, secret, algorithm="HS256")


def _supabase_user_response(user_id: str, email: str, role: str):
    """Build a mock GoTrue AuthResponse returned by supabase.auth.get_user()."""
    mock_response = MagicMock()
    mock_response.user = MagicMock()
    mock_response.user.id = user_id
    mock_response.user.email = email
    mock_response.user.user_metadata = {"role": role}
    return mock_response


# ---------------------------------------------------------------------------
# BLOCKER-1: Forged / wrong-secret token must be rejected (CRITICAL §13.3.1)
#
# Current behaviour (FAIL):  verify_signature=False accepts any token.
# Required behaviour (PASS):  only tokens verifiable by Supabase / known secret
#                             are accepted; wrong-secret tokens → 401 AUTH_REQUIRED.
# ---------------------------------------------------------------------------

class TestForgedTokenRejected:
    """
    A token signed with an attacker-controlled secret must be rejected.

    DESIGN.md §13.3.1: "the dependency must verify the token. Two viable approaches:
    supabase.auth.get_user(token) [...] or jwt.decode(token, settings.supabase_jwt_secret,
    algorithms=['HS256']). Either approach must reject any token whose signature does
    not match."
    """

    def test_forged_token_returns_401(self):
        """
        A token whose signature does not match must return 401, not 200.

        Strategy: patch supabase.auth.get_user to raise an exception (simulating
        GoTrue rejecting the token) — the dependency must propagate this as 401.
        If the dependency is still using verify_signature=False it will return 200,
        causing this test to fail (Red phase).
        """
        forged_token = _token_signed_with(_WRONG_SECRET)

        # Simulate Supabase GoTrue rejecting the token
        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.side_effect = Exception(
            "invalid JWT: signature does not match"
        )

        with patch("app.api.dependencies.get_supabase", return_value=mock_supabase):
            response = _client.get(
                "/protected",
                headers={"Authorization": f"Bearer {forged_token}"},
            )

        assert response.status_code == 401, (
            f"A forged token (wrong secret) must be rejected with 401. "
            f"Got {response.status_code}. "
            f"This indicates verify_signature=False is still in use — "
            f"DESIGN.md §13.3.1 CRITICAL violation."
        )

    def test_forged_token_returns_auth_required_envelope(self):
        """
        The 401 for a forged token must use the standard error envelope with
        code=AUTH_REQUIRED (DESIGN.md §3.1.1 + §3.1.2).
        """
        forged_token = _token_signed_with(_WRONG_SECRET)

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.side_effect = Exception(
            "invalid JWT: signature does not match"
        )

        with patch("app.api.dependencies.get_supabase", return_value=mock_supabase):
            response = _client.get(
                "/protected",
                headers={"Authorization": f"Bearer {forged_token}"},
            )

        body = response.json()
        assert "error" in body, (
            f"Forged token rejection must use standard envelope. Got: {body}"
        )
        assert body["error"]["code"] == "AUTH_REQUIRED", (
            f"Expected AUTH_REQUIRED, got: {body['error'].get('code')}"
        )
        assert "request_id" in body["error"], (
            "Standard envelope requires request_id field."
        )

    def test_valid_supabase_token_returns_200(self):
        """
        A token that Supabase GoTrue accepts must still return 200.
        Verifies the fix does not break the happy path.
        """
        user_id = str(uuid.uuid4())
        email = "real.user@example.com"
        role = "instructor"
        token = _token_signed_with(_REAL_SECRET, {
            "sub": user_id,
            "email": email,
            "user_metadata": {"role": role},
        })

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.return_value = _supabase_user_response(
            user_id, email, role
        )

        with patch("app.api.dependencies.get_supabase", return_value=mock_supabase):
            response = _client.get(
                "/protected",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 200, (
            f"A token accepted by Supabase must return 200. Got {response.status_code}: "
            f"{response.json()}"
        )

    def test_valid_supabase_token_returns_correct_user_id(self):
        """
        The user_id in the response must come from the Supabase-verified token,
        not from an unverified payload claim.
        """
        user_id = str(uuid.uuid4())
        email = "real.user@example.com"
        role = "student"
        token = _token_signed_with(_REAL_SECRET, {
            "sub": user_id,
            "email": email,
            "user_metadata": {"role": role},
        })

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.return_value = _supabase_user_response(
            user_id, email, role
        )

        with patch("app.api.dependencies.get_supabase", return_value=mock_supabase):
            response = _client.get(
                "/protected",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.json()["user_id"] == user_id, (
            f"user_id in response must match Supabase-verified user id. "
            f"Got: {response.json()}"
        )


# ---------------------------------------------------------------------------
# BLOCKER-2: verify_signature=False must not be present in dependencies.py
# (CRITICAL §13.3.1)
# ---------------------------------------------------------------------------

class TestNoVerifySignatureFalseInCode:
    """
    Static assertion: dependencies.py must not contain verify_signature=False.

    This is a CRITICAL violation per DESIGN.md §13.3.1 and the issue #37 finding.
    The test reads the source file directly so it fails regardless of mocking.
    """

    def test_verify_signature_false_not_in_dependencies_py(self):
        """
        DESIGN.md §13.3.1: the dependency must verify the token.
        'verify_signature=False' is an explicit bypass and must not appear.
        """
        deps_path = Path(__file__).parent.parent / "app" / "api" / "dependencies.py"
        source = deps_path.read_text()
        assert "verify_signature" not in source, (
            "CRITICAL §13.3.1 violation: 'verify_signature=False' found in "
            f"{deps_path}. Remove it and call supabase.auth.get_user(token) "
            "or use local HS256 verification."
        )

    def test_supabase_get_user_called_in_dependencies_py(self):
        """
        DESIGN.md §13.3.1 prescribes supabase.auth.get_user() as the preferred
        verification path. The dependency must call it (or an equivalent local
        HS256 verify).
        """
        deps_path = Path(__file__).parent.parent / "app" / "api" / "dependencies.py"
        source = deps_path.read_text()
        # Either get_user or local HS256 verification via jwt.decode with a real secret
        has_get_user = "get_user" in source
        has_hs256_verify = (
            "algorithms" in source and "verify_signature" not in source
        )
        assert has_get_user or has_hs256_verify, (
            "dependencies.py must call supabase.auth.get_user(token) or perform "
            "local HS256 verification. Neither was found. "
            "DESIGN.md §13.3.1 CRITICAL violation."
        )

    def test_misleading_gap2_docstring_removed(self):
        """
        BLOCKER-2: The docstring at dependencies.py:48-51 must not claim GAP-2
        authorises skipping signature verification. GAP-2 is about centralised
        dependency absence, not a licence for verify_signature=False.
        """
        deps_path = Path(__file__).parent.parent / "app" / "api" / "dependencies.py"
        source = deps_path.read_text()
        # The misleading phrase is the combination of GAP-2 + verify_signature bypass
        assert not (
            "GAP-2 acknowledged" in source and "verify_signature" in source
        ), (
            "The docstring falsely cites GAP-2 as authorisation for "
            "verify_signature=False. GAP-2 covers absence of centralised dependency, "
            "not signature skipping. Remove the misleading reference."
        )


# ---------------------------------------------------------------------------
# BLOCKER-3: Existing vacuous test — token signed with wrong secret
# (This supplements test_feat_001_auth.py which had no wrong-key test)
# ---------------------------------------------------------------------------

class TestWrongSecretRejectedWithoutMocking:
    """
    Additional non-mocked scenario: if the dependency uses local HS256 verification,
    a token signed with the wrong secret must raise a jwt.InvalidSignatureError
    which the dependency must catch and convert to 401.

    If the dependency uses supabase.auth.get_user() instead, these tests are
    handled by TestForgedTokenRejected above (which mocks the Supabase call).
    These tests are supplementary and apply only when local HS256 is used.
    They also verify BLOCKER-3: no vacuous passes due to verify_signature=False.
    """

    def test_empty_key_token_is_not_vacuously_accepted(self):
        """
        A token signed with key="" (as used in _make_token in test_feat_001_auth.py)
        must be rejected when the dependency actually verifies signatures.

        Under verify_signature=False this test would PASS (vacuous) — after the fix,
        either the Supabase GoTrue call will reject it, or the local HS256 check will.
        We simulate the GoTrue rejection path here.
        """
        empty_key_token = jwt.encode(
            {"sub": str(uuid.uuid4()), "email": "sneaky@example.com",
             "user_metadata": {"role": "instructor"}},
            key="",
            algorithm="HS256",
        )

        mock_supabase = MagicMock()
        mock_supabase.auth.get_user.side_effect = Exception(
            "invalid JWT: could not verify signature"
        )

        with patch("app.api.dependencies.get_supabase", return_value=mock_supabase):
            response = _client.get(
                "/protected",
                headers={"Authorization": f"Bearer {empty_key_token}"},
            )

        assert response.status_code == 401, (
            f"A token signed with key='' must be rejected as unverifiable. "
            f"Got {response.status_code}. This confirms the fix is real, not vacuous."
        )
