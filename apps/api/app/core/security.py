from datetime import datetime, timedelta, timezone
from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)


def create_access_token(*, subject: str, tenant_id: str, role: str, expires_delta: timedelta | None = None) -> str:
    now = datetime.now(timezone.utc)
    claims = {"sub": subject, "tenant_id": tenant_id, "role": role, "iat": now, "exp": now + (expires_delta or timedelta(minutes=settings.access_token_minutes))}
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def current_principal(token: Annotated[str | None, Depends(oauth2_scheme)]) -> dict:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required", headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if not claims.get("sub") or not claims.get("tenant_id") or not claims.get("role"):
            raise JWTError("Required claims missing")
        return claims
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token", headers={"WWW-Authenticate": "Bearer"}) from exc


def require_roles(*roles: str):
    def dependency(principal: Annotated[dict, Depends(current_principal)]) -> dict:
        if principal["role"] not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return principal
    return dependency
