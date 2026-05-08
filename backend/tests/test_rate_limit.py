"""
Tests for the per-user rate limiter on LLM-facing endpoints.

The limiter is intentionally process-local — these tests exercise it
directly (RateLimiter unit tests) and through the /quiz/generate
endpoint (integration tests) using the autouse auth-mock fixture from
conftest.py to mint Bearer tokens for distinct user IDs.
"""

from __future__ import annotations

import time

import jwt
from fastapi.testclient import TestClient

from app.api import rate_limit as rate_limit_mod
from app.api.rate_limit import RateLimiter, llm_rate_limiter
from app.core.error_codes import RATE_LIMITED
from main import app

client = TestClient(app)


def _token_for(user_id: str, role: str = "student") -> str:
    return jwt.encode(
        {"sub": user_id, "email": f"{user_id}@example.com", "user_metadata": {"role": role}},
        "test-secret",
    )


# ── Unit tests ────────────────────────────────────────────────────────


def test_rate_limiter_allows_calls_under_budget():
    rl = RateLimiter(limit=3, window_s=60)
    for _ in range(3):
        allowed, retry = rl.check("user-1")
        assert allowed is True
        assert retry == 0


def test_rate_limiter_blocks_call_over_budget():
    rl = RateLimiter(limit=2, window_s=60)
    rl.check("user-1")
    rl.check("user-1")
    allowed, retry = rl.check("user-1")
    assert allowed is False
    assert retry >= 1


def test_rate_limiter_is_per_user():
    rl = RateLimiter(limit=1, window_s=60)
    assert rl.check("user-A") == (True, 0)
    assert rl.check("user-A")[0] is False
    # A different user starts fresh.
    assert rl.check("user-B") == (True, 0)


def test_rate_limiter_window_expires(monkeypatch):
    rl = RateLimiter(limit=1, window_s=2)
    base = [1000.0]
    monkeypatch.setattr(rl, "_now", lambda: base[0])
    assert rl.check("user-1")[0] is True
    assert rl.check("user-1")[0] is False
    base[0] += 3.0  # window has elapsed
    assert rl.check("user-1")[0] is True


# ── Integration tests against /quiz/generate ──────────────────────────
# generate_quiz makes real OpenAI calls when chunks/topic are valid; we
# rely on the limiter rejecting *before* the route body runs, so over-
# limit requests never reach the LLM and we don't need to mock it.


def test_quiz_generate_returns_429_after_budget(monkeypatch):
    # Lower the budget for this test so we don't have to make 6 real calls.
    monkeypatch.setattr(rate_limit_mod.llm_rate_limiter, "limit", 1)
    monkeypatch.setattr(rate_limit_mod.llm_rate_limiter, "window_s", 60)

    headers = {"Authorization": f"Bearer {_token_for('rl-user-1')}"}
    body = {"topic": "test", "num_questions": 1, "difficulty": "easy", "question_types": ["multiple_choice"], "outside_sources": True}

    # First call passes the limiter (it may fail later inside the LLM —
    # status 200 or 5xx are both fine; we only care that it's NOT 429).
    first = client.post("/quiz/generate", headers=headers, json=body)
    assert first.status_code != 429

    # Second call must be blocked by the limiter without ever invoking
    # the route body.
    second = client.post("/quiz/generate", headers=headers, json=body)
    assert second.status_code == 429
    payload = second.json()
    assert payload["error"]["code"] == RATE_LIMITED
    assert "request_id" in payload["error"]
    assert "Retry-After" in second.headers


def test_quiz_generate_rate_limit_is_per_user(monkeypatch):
    monkeypatch.setattr(rate_limit_mod.llm_rate_limiter, "limit", 1)

    headers_a = {"Authorization": f"Bearer {_token_for('rl-user-A')}"}
    headers_b = {"Authorization": f"Bearer {_token_for('rl-user-B')}"}
    body = {"topic": "test", "num_questions": 1, "difficulty": "easy", "question_types": ["multiple_choice"], "outside_sources": True}

    client.post("/quiz/generate", headers=headers_a, json=body)
    over_limit = client.post("/quiz/generate", headers=headers_a, json=body)
    assert over_limit.status_code == 429

    # User B has its own counter and starts fresh.
    user_b_first = client.post("/quiz/generate", headers=headers_b, json=body)
    assert user_b_first.status_code != 429
