"""FastAPI dependencies for authentication and authorization."""

import uuid
from typing import Optional

import jwt
from fastapi import Header, Request
from fastapi.responses import JSONResponse

from app.core.error_codes import AUTH_REQUIRED
from app.core.supabase import get_supabase


def _auth_error(message: str) -> JSONResponse:
    """
    Return a 401 response using the standard error envelope (DESIGN.md §3.1.1).

      {
        "error": {
          "code": "AUTH_REQUIRED",
          "message": "<human-readable>",
          "request_id": "<uuid>"
        }
      }
    """
    return JSONResponse(
        status_code=401,
        content={
            "error": {
                "code": AUTH_REQUIRED,
                "message": message,
                "request_id": str(uuid.uuid4()),
            }
        },
    )


def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
) -> dict:
    """
    Extract and validate the current user from the JWT in the Authorization header.

    Verification strategy (DESIGN.md §13.3.1):
        Call supabase.auth.get_user(token) — this delegates token verification to
        Supabase GoTrue server-side. Any token with an invalid or forged signature
        is rejected by GoTrue and surfaces here as an exception, which we convert
        to a 401 AUTH_REQUIRED response.

    Returns a dict with user info: {"id": "uuid", "email": "...", "role": "..."}

    Raises a 401 JSONResponse (standard envelope) if the token is missing, malformed,
    or fails GoTrue signature verification.
    """
    if not authorization:
        raise _EnvelopeException(
            _auth_error("Please sign in to continue.")
        )

    if not authorization.startswith("Bearer "):
        raise _EnvelopeException(
            _auth_error("Please sign in to continue.")
        )

    token = authorization[len("Bearer "):]

    try:
        supabase = get_supabase()
        response = supabase.auth.get_user(token)

        if response is None or response.user is None:
            raise _EnvelopeException(
                _auth_error("Please sign in to continue.")
            )

        user = response.user
        user_id = user.id
        email = user.email
        role = (
            (user.user_metadata or {}).get("role")
            if user.user_metadata
            else None
        )

        if not user_id:
            raise _EnvelopeException(
                _auth_error("Please sign in to continue.")
            )

        return {"id": user_id, "email": email, "role": role}

    except _EnvelopeException:
        raise
    except jwt.DecodeError:
        raise _EnvelopeException(
            _auth_error("Please sign in to continue.")
        )
    except Exception:
        # GoTrue rejected the token (invalid signature, expired, etc.)
        raise _EnvelopeException(
            _auth_error("Please sign in to continue.")
        )


class _EnvelopeException(Exception):
    """
    Carrier for a pre-built JSONResponse so that the FastAPI exception handler
    can return it verbatim.  This lets get_current_user produce the standard
    error envelope without importing HTTPException.
    """

    def __init__(self, response: JSONResponse) -> None:
        self.response = response
