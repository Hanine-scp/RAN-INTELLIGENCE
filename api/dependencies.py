from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.services.auth_service import AuthUser, auth_service
from src.services.auth_token_resolver import resolve_access_token

bearer_scheme = HTTPBearer(auto_error=False)

ADMIN_ONLY_PERMISSIONS = {
    "import_xml",
    "manage_snapshots",
    "manage_users",
    "manage_roles",
    "manage_settings",
    "manage_trust",
}


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        return resolve_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def require_permission(permission: str):
    def _checker(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if permission not in user.permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {permission}")
        return user

    return _checker
