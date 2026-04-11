"""FastAPI dependencies for authentication and authorization."""

from fastapi import Header, HTTPException
from typing import Optional
import jwt
from app.core.config import settings


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    Extract and validate the current user from the JWT in the Authorization header.

    Returns a dict with user info: {"id": "uuid", "email": "...", "role": "..."}

    Raises HTTPException 401 if token is missing or invalid.

    NOTE: This is a placeholder implementation. In production, you should:
    - Verify the JWT signature using Supabase's JWT secret
    - Validate the token expiration
    - Extract user_id from the token payload
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    token = authorization.replace("Bearer ", "")

    try:
        # Decode without verification for now (GAP-2 acknowledged)
        # In production, use: jwt.decode(token, supabase_jwt_secret, algorithms=["HS256"])
        payload = jwt.decode(token, options={"verify_signature": False})

        user_id = payload.get("sub")
        email = payload.get("email")
        role = payload.get("user_metadata", {}).get("role") or payload.get("role")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")

        return {
            "id": user_id,
            "email": email,
            "role": role,
        }
    except jwt.DecodeError:
        raise HTTPException(status_code=401, detail="Invalid token")
