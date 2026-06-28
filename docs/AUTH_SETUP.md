# Authentication Setup (JWT + Mailtrap)

This guide covers the **classic JWT authentication flow** integrated with the existing RAN Intelligence platform.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account (bcrypt password, sends verification email) |
| `POST` | `/auth/login` | Sign in with email + password (JWT access + refresh tokens) |
| `GET` | `/auth/verify-email?token=...` | Activate account after email link click |
| `POST` | `/auth/forgot-password` | Request password reset email |
| `POST` | `/auth/reset-password` | Set new password with reset token |
| `POST` | `/auth/resend-verification` | Resend email verification link |

Legacy MFA endpoints (`/auth/signup`, `/auth/login/user`, etc.) remain available for the enterprise invite flow.

## Mailtrap setup

### Mode test (sandbox — emails capturés dans l'inbox Mailtrap)

1. [mailtrap.io](https://mailtrap.io) → **Email Testing → Inboxes → SMTP Settings**
2. Copier user/password dans `.env.auth`

### Mode réel (Live SMTP — emails livrés)

1. **Email Sending → Sending Domains** → vérifier un domaine
2. **Integrations → SMTP** : `live.smtp.mailtrap.io`, port `587`, user `api`
3. **Settings → API Tokens** → token Admin → `MAILTRAP_API_TOKEN` et `SMTP_PASS`

Voir aussi `docs/AUTH_NOTIFICATIONS_SETUP.md` pour Twilio Verify (SMS OTP).

## Required environment variables

Create or update `.env.auth` (same structure as `.env.auth.example`):

```env
AUTH_JWT_SECRET=replace-with-long-random-string
AUTH_DEV_MODE=false
AUTH_NOTIFICATIONS_ENABLED=true
AUTH_OTP_MINUTES=10

APP_FRONTEND_URL=http://localhost:3000
APP_WEBOTP_DOMAIN=localhost

# Mailtrap Live SMTP (OTP email)
MAILTRAP_API_TOKEN=mt_votre_token
SMTP_HOST=live.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=api
SMTP_PASS=mt_votre_token
SMTP_FROM=RAN Intelligence <noreply@votre-domaine-verifie.com>
SMTP_USE_TLS=true

# Twilio Verify (OTP SMS)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional JWT aliases
JWT_SECRET=replace-with-64-char-random-string
JWT_EXPIRES_IN=30m
AUTH_EMAIL_VERIFY_HOURS=24
AUTH_PASSWORD_RESET_HOURS=1

# Database (SQLite default if AUTH_DATABASE_URL unset)
AUTH_DB_PATH=data/auth/platform_auth.db
```

`JWT_EXPIRES_IN` accepts `30m`, `2h`, `7d`, or minutes as an integer. Values above `10000` are treated as seconds.

## Install dependencies

Dependencies are already in `requirements.txt`:

```bash
pip install passlib[bcrypt] bcrypt PyJWT fastapi uvicorn
```

## Start services

```bash
# API (from repo root)
python -m uvicorn api.main:app --host 127.0.0.1 --port 8010 --reload

# Frontend
cd frontend && npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8010` in `frontend/.env.local`.

## API examples

### Register

```http
POST /auth/register
Content-Type: application/json

{
  "email": "analyst@ooredoo.ran",
  "password": "SecurePass123!",
  "full_name": "RAN Analyst"
}
```

Response `200`:

```json
{
  "data": {
    "user_id": 2,
    "email": "analyst@ooredoo.ran",
    "message": "Registration successful. Check your email to verify your account.",
    "email_sent": true
  }
}
```

### Verify email

Open the link from Mailtrap, or call:

```http
GET /auth/verify-email?token=TOKEN_FROM_EMAIL
```

Response `200`:

```json
{
  "data": {
    "message": "Email verified successfully. You can now sign in.",
    "already_verified": false,
    "user": { "id": 2, "email": "analyst@ooredoo.ran", "email_verified": true, "is_active": true }
  }
}
```

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "analyst@ooredoo.ran",
  "password": "SecurePass123!"
}
```

Response `200`:

```json
{
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "...",
    "token_type": "bearer",
    "expires_in": 1800,
    "user": { "id": 2, "email": "analyst@ooredoo.ran", "role": "responsable" }
  }
}
```

Use the access token on protected routes:

```http
Authorization: Bearer eyJ...
```

### Forgot password

```http
POST /auth/forgot-password
Content-Type: application/json

{ "email": "analyst@ooredoo.ran" }
```

Always returns a generic message (no email enumeration).

### Reset password

```http
POST /auth/reset-password
Content-Type: application/json

{
  "token": "TOKEN_FROM_EMAIL",
  "new_password": "NewSecurePass456!"
}
```

## Manual test checklist

1. **Register** — `POST /auth/register` or `/register` in the UI.
2. **Email** — Open Mailtrap inbox, click “Vérifier mon compte”.
3. **Verify** — `/verify-email` page should show success.
4. **Login** — `/login` → mode “Email” or `POST /auth/login`.
5. **Protected route** — Dashboard loads with JWT cookie/session.
6. **Forgot password** — `/forgot-password`, check Mailtrap for reset link.
7. **Reset** — `/reset-password?token=...`, then login with new password.

When SMTP/Twilio are disabled, set `AUTH_DEV_MODE=true` — the API may return OTP hints in responses for local testing only.

## Files (classic JWT auth)

| File | Role |
|------|------|
| `api/auth_routes.py` | HTTP endpoints, rate limits, guards |
| `api/dependencies.py` | JWT Bearer guard (`get_current_user`, `require_admin`) |
| `api/schemas.py` | Pydantic DTOs with validation |
| `src/services/auth_service.py` | bcrypt, JWT, tokens, business logic |
| `src/services/auth_database.py` | SQLite/PostgreSQL schema |
| `src/services/notification_service.py` | SMTP delivery (Mailtrap) |
| `src/services/email_templates.py` | Verification + password reset HTML/text templates |
| `config/env_loader.py` | Loads `.env.auth` |
| `frontend/app/register/page.tsx` | Sign up UI → `POST /auth/register` |
| `frontend/app/login/login-form.tsx` | Sign in (Email / MFA / Admin tabs) |
| `frontend/app/forgot-password/page.tsx` | Forgot password UI |
| `frontend/app/reset-password/` | Reset password UI |
| `frontend/app/verify-email/` | Email verification UI |
| `frontend/components/auth-provider.tsx` | Session + route protection |
| `frontend/proxy.ts` | Cookie-based middleware gate |
| `docs/AUTH_SETUP.md` | This guide |

## Security notes

- Passwords are hashed with **bcrypt** via `passlib`.
- Verification and reset tokens are **SHA-256 hashed** at rest; raw tokens are only sent by email.
- Tokens expire after configurable hours and are single-use.
- Password reset revokes active refresh tokens.
- Duplicate email registration returns `400 Email already registered`.
