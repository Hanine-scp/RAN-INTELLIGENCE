from __future__ import annotations

import os


def _flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


class FeatureFlags:
    cache_enabled: bool = _flag("CACHE_ENABLED", "true")
    metrics_enabled: bool = _flag("METRICS_ENABLED", "true")
    rate_limit_enabled: bool = _flag("RATE_LIMIT_ENABLED", "true")
    structured_logs: bool = _flag("STRUCTURED_LOGS_ENABLED", "true")
    background_email: bool = _flag("BACKGROUND_EMAIL_ENABLED", "true")
    premium_skeletons: bool = _flag("NEXT_PUBLIC_PREMIUM_SKELETONS", "true")
    sentry_enabled: bool = _flag("SENTRY_ENABLED", "false")
    otel_enabled: bool = _flag("OTEL_ENABLED", "false")

    @classmethod
    def as_dict(cls) -> dict[str, bool]:
        return {
            "cache_enabled": cls.cache_enabled,
            "metrics_enabled": cls.metrics_enabled,
            "rate_limit_enabled": cls.rate_limit_enabled,
            "structured_logs": cls.structured_logs,
            "background_email": cls.background_email,
            "premium_skeletons": cls.premium_skeletons,
            "sentry_enabled": cls.sentry_enabled,
            "otel_enabled": cls.otel_enabled or bool(os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()),
        }


feature_flags = FeatureFlags()
