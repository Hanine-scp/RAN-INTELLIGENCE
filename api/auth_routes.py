from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request

from api.dependencies import get_current_user, require_admin
from api.rate_limit import rate_limiter
from api.schemas import (
    ActivateUserPayload,
    AdminBootstrapPayload,
    AdminBootstrapVerifyPayload,
    AdminCreateUserPayload,
    AdminLoginStep1Payload,
    AdminLoginStep2Payload,
    AdminVerifyUserPayload,
    CreateAccessKeyPayload,
    ForgotPasswordPayload,
    LoginPayload,
    RefreshTokenPayload,
    RegisterPayload,
    ResetPasswordPayload,
    ResendVerificationPayload,
    SignupPayload,
    SignupPhonePayload,
    SignupVerifyPayload,
    UserLoginStep1Payload,
    UserLoginStep2Payload,
    UserStatusPayload,
)
from src.services.auth_database import check_database_connection
from src.services.auth_service import AuthUser, auth_service
from src.services.notification_service import notification_service
from src.services.platform_activity_service import platform_activity_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _handle_value_error(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.get("/job-profiles")
def job_profiles() -> dict:
    return {"data": auth_service.job_profiles()}


@router.get("/notifications/status")
def notifications_status() -> dict:
    return {"data": notification_service.status()}


@router.get("/database/status")
def database_status() -> dict:
    data = check_database_connection()
    data["platform"] = platform_activity_service.activity_summary()
    return {"data": data}


@router.get("/activity")
def activity_log(admin: AuthUser = Depends(require_admin), limit: int = 50) -> dict:
    return {"data": platform_activity_service.recent_activity(limit=limit)}


@router.post("/register")
def register(request: Request, payload: RegisterPayload, background_tasks: BackgroundTasks) -> dict:
    rate_limiter.check(request, namespace="auth_register", max_requests=12)
    try:
        data = auth_service.register_user(**payload.model_dump())
        email_job = data.pop("_email_job", None)
        if email_job:
            background_tasks.add_task(auth_service.deliver_registration_email, **email_job)
        return {"data": data}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/login")
def login(request: Request, payload: LoginPayload) -> dict:
    rate_limiter.check(request, namespace="auth_login", max_requests=20)
    try:
        return {"data": auth_service.login_user(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/forgot-password")
def forgot_password(request: Request, payload: ForgotPasswordPayload, background_tasks: BackgroundTasks) -> dict:
    rate_limiter.check(request, namespace="auth_forgot", max_requests=8)
    try:
        data = auth_service.forgot_password(**payload.model_dump())
        email_job = data.pop("_email_job", None)
        if email_job:
            background_tasks.add_task(auth_service.deliver_password_reset_email, **email_job)
        return {"data": data}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/reset-password")
def reset_password(request: Request, payload: ResetPasswordPayload) -> dict:
    rate_limiter.check(request, namespace="auth_reset", max_requests=10)
    try:
        return {"data": auth_service.reset_password(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/resend-verification")
def resend_verification(
    request: Request,
    payload: ResendVerificationPayload,
    background_tasks: BackgroundTasks,
) -> dict:
    rate_limiter.check(request, namespace="auth_resend_verify", max_requests=6)
    try:
        data = auth_service.resend_verification_email(**payload.model_dump())
        email_job = data.pop("_email_job", None)
        if email_job:
            background_tasks.add_task(auth_service.deliver_registration_email, **email_job)
        return {"data": data}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.get("/verify-email")
def verify_email(token: str = Query(..., min_length=16, max_length=256)) -> dict:
    try:
        return {"data": auth_service.verify_email(token=token)}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.get("/bootstrap/status")
def bootstrap_status() -> dict:
    return {"data": auth_service.bootstrap_status()}


@router.post("/bootstrap/admin")
def bootstrap_admin(request: Request, payload: AdminBootstrapPayload) -> dict:
    rate_limiter.check(request, namespace="auth_bootstrap", max_requests=6)
    try:
        return {"data": auth_service.bootstrap_admin_signup(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/bootstrap/admin/{user_id}/resend-otp")
def resend_bootstrap_admin_otp(user_id: int) -> dict:
    try:
        return {"data": auth_service.resend_bootstrap_admin_otp(user_id=user_id)}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/bootstrap/admin/verify")
def bootstrap_admin_verify(payload: AdminBootstrapVerifyPayload) -> dict:
    try:
        return {"data": auth_service.verify_bootstrap_admin(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/signup")
def signup(payload: SignupPayload) -> dict:
    try:
        return {"data": auth_service.signup_user(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/users/create")
def admin_create_user(payload: AdminCreateUserPayload, admin: AuthUser = Depends(require_admin)) -> dict:
    try:
        return {"data": auth_service.admin_create_user(created_by=admin.id, **payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/users/{user_id}/verify-provision")
def admin_verify_user(user_id: int, payload: AdminVerifyUserPayload, admin: AuthUser = Depends(require_admin)) -> dict:
    try:
        return {
            "data": auth_service.verify_user_provision(
                user_id=user_id,
                email_code=payload.email_code,
                phone_code=payload.phone_code,
                actor_id=admin.id,
            )
        }
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/users/{user_id}/resend-provision-otp")
def resend_provision_otp(user_id: int, admin: AuthUser = Depends(require_admin)) -> dict:
    try:
        return {"data": auth_service.resend_provision_otp(user_id=user_id, actor_id=admin.id)}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/activate")
def activate_user(payload: ActivateUserPayload) -> dict:
    try:
        return {"data": auth_service.activate_user_by_email(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/signup/{user_id}/resend-otp")
def resend_signup_otp(user_id: int) -> dict:
    try:
        return {"data": auth_service.resend_signup_otp(user_id=user_id)}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/signup/{user_id}/phone")
def signup_set_phone(user_id: int, payload: SignupPhonePayload) -> dict:
    try:
        return {"data": auth_service.signup_set_phone(user_id=user_id, phone=payload.phone)}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/signup/verify")
def signup_verify(payload: SignupVerifyPayload) -> dict:
    try:
        return {"data": auth_service.verify_signup(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/login/user")
def login_user_step1(payload: UserLoginStep1Payload) -> dict:
    try:
        return {"data": auth_service.login_user_step1(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/login/user/mfa")
def login_user_step2(payload: UserLoginStep2Payload) -> dict:
    try:
        return {"data": auth_service.login_user_step2(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/login/admin")
def login_admin_step1(payload: AdminLoginStep1Payload) -> dict:
    try:
        return {"data": auth_service.login_admin_step1(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/login/admin/verify")
def login_admin_step2(payload: AdminLoginStep2Payload) -> dict:
    try:
        return {"data": auth_service.login_admin_step2(**payload.model_dump())}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/refresh")
def refresh(payload: RefreshTokenPayload) -> dict:
    try:
        return {"data": auth_service.refresh_session(payload.refresh_token)}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.post("/logout")
def logout(payload: RefreshTokenPayload) -> dict:
    auth_service.logout(payload.refresh_token)
    return {"data": {"ok": True}}


@router.get("/me")
def me(user: AuthUser = Depends(get_current_user)) -> dict:
    return {"data": auth_service.serialize_user(user)}


@router.get("/users")
def list_users(_: AuthUser = Depends(require_admin)) -> dict:
    return {"data": auth_service.list_users()}


@router.post("/access-keys")
def create_access_key(payload: CreateAccessKeyPayload, admin: AuthUser = Depends(require_admin)) -> dict:
    try:
        return {
            "data": auth_service.create_access_key(
                key_label=payload.key_label,
                key_type=payload.key_type,
                max_uses=payload.max_uses,
                created_by=admin.id,
            )
        }
    except ValueError as exc:
        raise _handle_value_error(exc) from exc


@router.patch("/users/{user_id}/status")
def update_user_status(user_id: int, payload: UserStatusPayload, admin: AuthUser = Depends(require_admin)) -> dict:
    try:
        return {"data": auth_service.set_user_active(user_id=user_id, is_active=payload.is_active, actor_id=admin.id)}
    except ValueError as exc:
        raise _handle_value_error(exc) from exc
