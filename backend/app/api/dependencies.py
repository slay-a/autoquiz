"""FastAPI dependencies for authentication and authorization."""

import uuid
from typing import Optional

import jwt
from fastapi import Header, Request
from fastapi.responses import JSONResponse

from app.core.error_codes import AUTH_REQUIRED


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

    Returns a dict with user info: {"id": "uuid", "email": "...", "role": "..."}

    Raises a 401 JSONResponse (standard envelope) if the token is missing or invalid.

    NOTE: This is a placeholder implementation. In production, verify the JWT
    signature using Supabase's JWT secret:
        jwt.decode(token, supabase_jwt_secret, algorithms=["HS256"])
    GAP-2 is acknowledged in DESIGN.md §12.
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
        # Decode without signature verification (GAP-2 acknowledged).
        payload = jwt.decode(token, options={"verify_signature": False})

        user_id = payload.get("sub")
        email = payload.get("email")
        role = (
            payload.get("user_metadata", {}).get("role")
            or payload.get("role")
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


class _EnvelopeException(Exception):
    """
    Carrier for a pre-built JSONResponse so that the FastAPI exception handler
    can return it verbatim.  This lets get_current_user produce the standard
    error envelope without importing HTTPException.
    """

    def __init__(self, response: JSONResponse) -> None:
        self.response = response
