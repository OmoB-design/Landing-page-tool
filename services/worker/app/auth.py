"""Request authentication (D43): verify the Supabase access token against the project's JWKS,
then check the user belongs to the org they are acting in."""

from functools import lru_cache
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config import get_settings
from app.db import fetch_one

_bearer = HTTPBearer(auto_error=False)


class AuthUser(BaseModel):
    id: UUID
    email: str | None = None


@lru_cache
def get_jwks_client() -> jwt.PyJWKClient:
    # Caches signing keys and refetches when a token names an unknown key id (rotation).
    return jwt.PyJWKClient(get_settings().jwks_url, cache_keys=True, lifespan=600)


def verify_token(token: str) -> AuthUser:
    """Returns the user for a valid access token; raises 401 otherwise."""
    settings = get_settings()
    try:
        signing_key = get_jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.") from exc
    return AuthUser(id=UUID(claims["sub"]), email=claims.get("email"))


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthUser:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in required.")
    return verify_token(credentials.credentials)


CurrentUser = Annotated[AuthUser, Depends(current_user)]


def require_org_member(user: AuthUser, org_id: UUID) -> None:
    """403 unless the user is a member of the org."""
    row = fetch_one(
        "select 1 from org_members where org_id = %(org_id)s and user_id = %(user_id)s",
        {"org_id": org_id, "user_id": user.id},
    )
    if row is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not a member of this organisation.")
