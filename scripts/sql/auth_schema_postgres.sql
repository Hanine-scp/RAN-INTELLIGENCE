-- RAN Intelligence — schéma auth PostgreSQL
-- Appliqué automatiquement au premier démarrage du conteneur Docker.

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    job_profile TEXT NOT NULL DEFAULT '',
    personal_access_key_hash TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    phone_verified INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login_at TEXT,
    department TEXT NOT NULL DEFAULT '',
    employee_id TEXT NOT NULL DEFAULT '',
    created_by_admin_id INTEGER
);

CREATE TABLE IF NOT EXISTS access_keys (
    id SERIAL PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    key_label TEXT NOT NULL,
    key_type TEXT NOT NULL CHECK(key_type IN ('signup', 'admin_login')),
    created_by INTEGER,
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    channel TEXT NOT NULL CHECK(channel IN ('email', 'phone')),
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_audit (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);

-- Activité plateforme (hors données métier Ooredoo)
CREATE TABLE IF NOT EXISTS app_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    method TEXT,
    path TEXT,
    detail TEXT,
    status_code INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_queries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    question TEXT NOT NULL,
    context_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    channel TEXT NOT NULL,
    destination TEXT NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);
