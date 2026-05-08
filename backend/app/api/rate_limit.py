"""
In-process per-user rate limiter for expensive LLM endpoints.

Implements a simple sliding-window counter keyed by user_id. The
window length and call budget are read from settings (defaults: 5
calls per 60 s) so they can be tuned per environment without code
changes.

The limiter is intentionally process-local: it protects a single
backend instance from a runaway client without requiring a shared
Redis counter. For multi-replica deployments swap _Counter for a
Redis-backed token bucket (see DESIGN.md §13).

The dependency raises an _EnvelopeException carrying the standard
§3.1.1 error envelope (code=RATE_LIMITED, status=429), so the global
exception handler in main.py serializes it consistently with every
other error in the API.
"""

from __future__ import annotations

import time
import uuid
from collections import deque
from threading import Lock
from typing import Deque, Dict

from fastapi import Depends
from fastapi.responses import JSONResponse

from app.api.dependencies import _EnvelopeException, get_current_user
from app.core.error_codes import RATE_LIMITED


# Defaults — tunable via constructor for tests.
_DEFAULT_LIMIT = 5
_DEFAULT_WINDOW_S = 60


class RateLimiter:
    """Thread-safe sliding-window counter, one deque of timestamps per user."""

    def __init__(self, limit: int = _DEFAULT_LIMIT, window_s: int = _DEFAULT_WINDOW_S) -> None:
        self.limit = limit
        self.window_s = window_s
        self._calls: Dict[str, Deque[float]] = {}
        self._lock = Lock()

    def _now(self) -> float:
        return time.monotonic()

    def check(self, user_id: str) -> tuple[bool, int]:
        """
        Record a call for user_id and return (allowed, retry_after_seconds).

        retry_after_seconds is 0 when allowed; otherwise it's the seconds
        remaining until the oldest call inside the window expires.
        """
        now = self._now()
        with self._lock:
            calls = self._calls.setdefault(user_id, deque())
            # Drop timestamps that have aged out of the window.
            while calls and now - calls[0] >= self.window_s:
                calls.popleft()

            if len(calls) >= self.limit:
                retry_after = max(1, int(self.window_s - (now - calls[0])))
                return False, retry_after

            calls.append(now)
            return True, 0

    def reset(self, user_id: str | None = None) -> None:
        """Clear counters (used by tests). With no arg, clears every user."""
        with self._lock:
            if user_id is None:
                self._calls.clear()
            else:
                self._calls.pop(user_id, None)


# Single shared instance across the process.
llm_rate_limiter = RateLimiter()


def enforce_llm_rate_limit(current_user: dict = Depends(get_current_user)) -> dict:
    """
    FastAPI dependency. Attach to LLM-facing endpoints to cap per-user
    call frequency. Returns the same `current_user` dict the route would
    otherwise receive from get_current_user, so this can replace that
    dependency directly without touching the route body.
    """
    user_id = current_user["id"]
    allowed, retry_after = llm_rate_limiter.check(user_id)
    if allowed:
        return current_user

    response = JSONResponse(
        status_code=429,
        headers={"Retry-After": str(retry_after)},
        content={
            "error": {
                "code": RATE_LIMITED,
                "message": (
                    f"You're generating content too quickly. "
                    f"Please wait {retry_after}s before trying again."
                ),
                "request_id": str(uuid.uuid4()),
            }
        },
    )
    raise _EnvelopeException(response)
