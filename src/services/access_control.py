"""RBAC, route permissions, and vendor/region scope for RAN Intelligence."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

SUPPORTED_VENDORS = ("nokia", "huawei")
DEFAULT_REGIONS = ("National", "Tunis", "Nord", "Centre", "Sud")

# Permissions granted to every authenticated user role (baseline read paths).
USER_BASE_PERMISSIONS = [
    "view_sites",
    "view_inventory",
    "compare_dates",
    "view_statistics",
    "view_failure_cards",
    "use_ai_search",
    "view_predictions",
    "view_spares",
    "export_reports",
]

ADMIN_EXTRA_PERMISSIONS = [
    "import_xml",
    "manage_snapshots",
    "manage_users",
    "manage_roles",
    "manage_settings",
    "manage_trust",
    "view_ops",
    "view_security_center",
]

JOB_PROFILE_PERMISSIONS: dict[str, list[str]] = {
    "ingenieur_ran_nokia": list(USER_BASE_PERMISSIONS),
    "ingenieur_optimisation_ran": [
        "view_sites",
        "view_inventory",
        "compare_dates",
        "view_statistics",
        "view_failure_cards",
        "use_ai_search",
        "view_predictions",
        "view_spares",
        "export_reports",
    ],
    "equipe_maintenance": [
        "view_sites",
        "view_inventory",
        "compare_dates",
        "view_spares",
        "export_reports",
    ],
    "responsable_spares": [
        "view_sites",
        "view_inventory",
        "view_spares",
        "export_reports",
    ],
    "data_analyst_bi": [
        "view_sites",
        "view_inventory",
        "view_statistics",
        "export_reports",
        "use_ai_search",
    ],
    "data_scientist_ia": [
        "view_sites",
        "view_inventory",
        "view_statistics",
        "view_predictions",
        "use_ai_search",
        "export_reports",
    ],
    "responsable_reseau_manager": list(USER_BASE_PERMISSIONS),
    "platform_admin": list(USER_BASE_PERMISSIONS) + list(ADMIN_EXTRA_PERMISSIONS),
}

READ_ONLY_FORBIDDEN_METHODS = frozenset({"PUT", "PATCH", "DELETE"})

# Users may mutate these paths despite read-only profile (personal workspace data).
USER_WRITE_ALLOWED_PREFIXES = (
    "/assistant/conversations",
)

PUBLIC_PREFIXES = (
    "/",
    "/health",
    "/ready",
    "/metrics",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/ops/client-vitals",
    "/ops/client-errors",
)

PUBLIC_AUTH_PREFIXES = (
    "/auth/login",
    "/auth/register",
    "/auth/signup",
    "/auth/activate",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
    "/auth/resend-verification",
    "/auth/bootstrap",
    "/auth/job-profiles",
    "/auth/notifications/status",
    "/auth/database/status",
)


@dataclass(frozen=True)
class RouteRule:
    permission: str | None = None
    admin_only: bool = False


def permissions_for(role: str, job_profile: str) -> list[str]:
    if role == "admin":
        return list(USER_BASE_PERMISSIONS) + list(ADMIN_EXTRA_PERMISSIONS)
    profile = (job_profile or "").strip() or "data_analyst_bi"
    return list(JOB_PROFILE_PERMISSIONS.get(profile, JOB_PROFILE_PERMISSIONS["data_analyst_bi"]))


def parse_csv_scope(raw: str | None, *, default: str) -> list[str]:
    value = (raw or "").strip() or default
    parts = [item.strip() for item in re.split(r"[,;|]", value) if item.strip()]
    return parts or [default]


def parse_allowed_vendors(raw: str | None) -> list[str]:
    items = [item.strip().lower() for item in parse_csv_scope(raw, default="nokia,huawei")]
    if "tous" in items or "all" in items or "*" in items:
        return list(SUPPORTED_VENDORS)
    return [item for item in items if item in SUPPORTED_VENDORS] or ["nokia"]


def parse_allowed_regions(raw: str | None) -> list[str]:
    items = parse_csv_scope(raw, default="National")
    if "national" in {item.lower() for item in items}:
        return list(DEFAULT_REGIONS)
    return items


def clamp_vendor(requested: str, allowed: list[str]) -> str:
    vendor = (requested or "nokia").strip().lower()
    if vendor not in SUPPORTED_VENDORS:
        vendor = "nokia"
    if vendor in allowed:
        return vendor
    return allowed[0]


def vendor_allowed(requested: str, allowed: list[str]) -> bool:
    vendor = (requested or "nokia").strip().lower()
    return vendor in allowed


def match_route_rule(path: str, method: str) -> RouteRule | None:
    if method == "OPTIONS":
        return None
    for prefix in PUBLIC_PREFIXES:
        if path == prefix or (prefix != "/" and path.startswith(prefix)):
            return None
    for prefix in PUBLIC_AUTH_PREFIXES:
        if path.startswith(prefix):
            return None

    rules: list[tuple[str, RouteRule]] = [
        ("/ingest/", RouteRule(admin_only=True)),
        ("/snapshots/", RouteRule(admin_only=True)),
        ("/temporal-changes", RouteRule(admin_only=True)),
        ("/global-counters", RouteRule(admin_only=True)),
        ("/clustering", RouteRule(admin_only=True)),
        ("/ai-report", RouteRule(admin_only=True)),
        ("/kpi/ingest", RouteRule(admin_only=True)),
        ("/rag/ingest", RouteRule(admin_only=True)),
        ("/rag/seed", RouteRule(admin_only=True)),
        ("/ops/summary", RouteRule(admin_only=True)),
        ("/ops/query-metrics", RouteRule(admin_only=True)),
        ("/ops/http-metrics", RouteRule(admin_only=True)),
        ("/ops/cache-stats", RouteRule(admin_only=True)),
        ("/ops/feature-flags", RouteRule(admin_only=True)),
        ("/trust/anchor", RouteRule(admin_only=True)),
        ("/guardian/run", RouteRule(admin_only=True)),
        ("/integrations/powerbi/sync", RouteRule(admin_only=True)),
        ("/integrations/n8n/workflows", RouteRule(admin_only=True)),
        ("/integrations/n8n/executions", RouteRule(admin_only=True)),
        ("/auth/users", RouteRule(admin_only=True)),
        ("/auth/access-keys", RouteRule(admin_only=True)),
        ("/auth/activity", RouteRule(admin_only=True)),
        ("/auth/security", RouteRule(admin_only=True)),
        ("/prediction", RouteRule(permission="view_predictions")),
        ("/statistics", RouteRule(permission="view_statistics")),
        ("/analytics", RouteRule(permission="view_statistics")),
        ("/spares", RouteRule(permission="view_spares")),
        ("/assistant", RouteRule(permission="use_ai_search")),
        ("/search/platform", RouteRule(permission="use_ai_search")),
        ("/search/web", RouteRule(permission="use_ai_search")),
        ("/rag/search", RouteRule(permission="use_ai_search")),
        ("/risk-cards", RouteRule(permission="view_failure_cards")),
        ("/anomalies", RouteRule(permission="view_failure_cards")),
        ("/guardian/", RouteRule(permission="view_sites")),
        ("/delta", RouteRule(permission="compare_dates")),
        ("/sites", RouteRule(permission="view_sites")),
        ("/inventory", RouteRule(permission="view_inventory")),
        ("/dashboard", RouteRule(permission="view_sites")),
        ("/filters/", RouteRule(permission="view_sites")),
        ("/asset-distribution", RouteRule(permission="view_inventory")),
        ("/quality", RouteRule(permission="view_inventory")),
        ("/replacements", RouteRule(permission="view_inventory")),
        ("/investigate/", RouteRule(permission="view_sites")),
        ("/trust/", RouteRule(permission="view_sites")),
        ("/integrations/powerbi/status", RouteRule(permission="export_reports")),
        ("/integrations/n8n/status", RouteRule(permission="view_sites")),
        ("/integrations/auth/config", RouteRule()),
    ]

    for prefix, rule in rules:
        if path.startswith(prefix) or path == prefix.rstrip("/"):
            return rule

    if path.startswith("/auth/"):
        return RouteRule()
    return RouteRule(permission="view_sites")


def access_denied_message(*, permission: str | None = None, read_only: bool = False) -> str:
    if read_only:
        return "403 Forbidden — Read-only profile"
    if permission:
        return f"403 Forbidden — Missing permission: {permission}"
    return "403 Forbidden — Access denied"


def user_scope_from_row(row: dict[str, Any]) -> dict[str, Any]:
    allowed_vendors = parse_allowed_vendors(str(row.get("allowed_vendors") or ""))
    allowed_regions = parse_allowed_regions(str(row.get("allowed_regions") or ""))
    return {
        "allowed_vendors": allowed_vendors,
        "allowed_regions": allowed_regions,
    }
