#!/usr/bin/env python3
"""Reorganize RAN-INTELLIGENCE frontend components, lib, app routes, and api package."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
API = ROOT / "api"

# --- Component moves: filename -> subfolder under components/ ---
COMPONENT_FOLDERS: dict[str, str] = {
    # providers
    "app-provider.tsx": "providers",
    "auth-provider.tsx": "providers",
    # layout
    "layout-frame.tsx": "layout",
    "nav-rail.tsx": "layout",
    "nav-icon.tsx": "layout",
    "top-bar.tsx": "layout",
    "page-shell.tsx": "layout",
    "auth-layout.tsx": "layout",
    "platform-period-banner.tsx": "layout",
    "vendor-banner.tsx": "layout",
    "filter-panel.tsx": "layout",
    "floating-copilot.tsx": "layout",
    # ui
    "data-table.tsx": "ui",
    "skeleton.tsx": "ui",
    "kpi-cards.tsx": "ui",
    "sortable-table-header.tsx": "ui",
    "table-sort-icons.tsx": "ui",
    "investigation-panel.tsx": "ui",
    "brand-logo.tsx": "ui",
    "ooredoo-poly-bg.tsx": "ui",
    "web-vitals.tsx": "ui",
    "error-reporter.tsx": "ui",
    "error-reporter-init.tsx": "ui",
    "unique-serial-filter-toggle.tsx": "ui",
    "cell-technology-share-card.tsx": "ui",
    "premium-hub-tabs.tsx": "ui",
    "premium-page-report-bar.tsx": "ui",
    # charts
    "charts.tsx": "charts",
    # auth
    "auth-fields.tsx": "auth",
    "auth-otp-premium.tsx": "auth",
    # admin
    "admin-users-page.tsx": "admin",
    "admin-security-page.tsx": "admin",
    # ai
    "ai-assistant-chat.tsx": "ai",
    "ai-assistant-workspace.tsx": "ai",
    "ai-attach-menu.tsx": "ai",
    "ai-camera-modal.tsx": "ai",
    "ai-chat-sidebar.tsx": "ai",
    "ai-message-actions.tsx": "ai",
    "ai-research-progress.tsx": "ai",
    "ai-web-sources-panel.tsx": "ai",
    # reports
    "standard-page-report-section.tsx": "reports",
    "hub-page-report-section.tsx": "reports",
    "page-report-host.tsx": "reports",
    "page-report-host-inner.tsx": "reports",
    "home-hub-report-section.tsx": "reports",
    "home-hub-report-modal.tsx": "reports",
    "home-hub-page-report-content.tsx": "reports",
    "home-hub-structured-report-body.tsx": "reports",
    "delta-ai-report-section.tsx": "reports",
    "delta-ai-report-modal.tsx": "reports",
    "guardian-ai-report-section.tsx": "reports",
    "guardian-ai-report-modal.tsx": "reports",
    "import-ai-report-section.tsx": "reports",
    "import-ai-report-modal.tsx": "reports",
    # features / home
    "home-page-layout.tsx": "features/home",
    "home-data-hub.tsx": "features/home",
    "home-data-hub-tabs.tsx": "features/home",
    "home-executive-dashboard-section.tsx": "features/home",
    # features / guardian
    "guardian-page-layout.tsx": "features/guardian",
    "guardian-hub-section.tsx": "features/guardian",
    "guardian-data-hub-tabs.tsx": "features/guardian",
    "guardian-changements-section.tsx": "features/guardian",
    # features / timeline
    "timeline-page-layout.tsx": "features/timeline",
    "delta-unified-page.tsx": "features/timeline",
    "temporal-changes-section.tsx": "features/timeline",
    # features / foresight
    "foresight-page-layout.tsx": "features/foresight",
    "prediction-section.tsx": "features/foresight",
    "spares-section.tsx": "features/foresight",
    "patterns-section.tsx": "features/foresight",
    "risk-cards-section.tsx": "features/foresight",
    "replacements-section.tsx": "features/foresight",
    # features / signals
    "signals-page-layout.tsx": "features/signals",
    "anomalies-section.tsx": "features/signals",
    "insight-page-layout.tsx": "features/signals",
    # features / analytics
    "analytics-section.tsx": "features/analytics",
    "statistics-section.tsx": "features/analytics",
    "clustering-section.tsx": "features/analytics",
    "global-counters-section.tsx": "features/analytics",
    "asset-distribution-section.tsx": "features/analytics",
    # features / inventory
    "inventory-detail-section.tsx": "features/inventory",
    "inventory-investigation-panel.tsx": "features/inventory",
    "assets-equipment-section.tsx": "features/inventory",
    "asset-investigation-panel.tsx": "features/inventory",
    "sites-table-section.tsx": "features/inventory",
    "quality-detail-section.tsx": "features/inventory",
    # features / platform
    "power-bi-section.tsx": "features/platform",
    "automation-page.tsx": "features/platform",
    "cartographie-reseau-page.tsx": "features/platform",
    "xml-import-page.tsx": "features/platform",
    "import-results-section.tsx": "features/platform",
}

# --- Lib moves: filename -> subfolder under lib/ ---
LIB_FOLDERS: dict[str, str] = {
    "api.ts": "api",
    "api-delta.ts": "api",
    "fetch-client.ts": "api",
    "auth.ts": "auth",
    "auth-api.ts": "auth",
    "auth-i18n.ts": "auth",
    "auth-theme.ts": "auth",
    "auth-signup-policy.ts": "auth",
    "auth-virgin-form.ts": "auth",
    "use-dashboard.ts": "hooks",
    "use-filter-options.ts": "hooks",
    "use-locale.ts": "hooks",
    "use-quality.ts": "hooks",
    "use-sites-page.ts": "hooks",
    "delta-report-data.ts": "reports",
    "delta-report-export.ts": "reports",
    "guardian-report-data.ts": "reports",
    "guardian-report-export.ts": "reports",
    "import-report-data.ts": "reports",
    "import-report-export.ts": "reports",
    "home-hub-report-export.ts": "reports",
    "home-hub-page-report-data.ts": "reports",
    "home-sites-report-data.ts": "reports",
    "page-report-meta.ts": "reports",
}

# App route groups (folder under app/ -> route group name)
APP_ROUTE_GROUPS: dict[str, str] = {
    "login": "(auth)",
    "signup": "(auth)",
    "register": "(auth)",
    "forgot-password": "(auth)",
    "reset-password": "(auth)",
    "verify-email": "(auth)",
    "activate": "(auth)",
    "admin": "(admin)",
    "timeline": "(platform)",
    "foresight": "(platform)",
    "signals": "(platform)",
    "insight": "(platform)",
    "ai-assistant": "(platform)",
    "power-bi": "(platform)",
    "import": "(platform)",
    "ops": "(platform)",
    "automation": "(platform)",
    "delta": "(modules)",
    "sites": "(modules)",
    "quality": "(modules)",
    "spares": "(modules)",
    "anomalies": "(modules)",
    "analytics": "(modules)",
    "statistiques": "(modules)",
    "prediction": "(modules)",
    "patterns": "(modules)",
    "clustering": "(modules)",
    "remplacements": "(modules)",
    "inventaire": "(modules)",
    "global-counters": "(modules)",
    "asset-distribution": "(modules)",
    "cartes-risque": "(modules)",
    "cartographie-reseau": "(modules)",
    "temporal-changes": "(modules)",
    "guardian": "(modules)",
    "ai-report": "(modules)",
}

API_MOVES: dict[str, str] = {
    "access_middleware.py": "middleware/access.py",
    "activity_middleware.py": "middleware/activity.py",
    "performance_middleware.py": "middleware/performance.py",
    "auth_routes.py": "routes/auth.py",
    "integration_routes.py": "routes/integration.py",
}


def move_file(src: Path, dst: Path) -> None:
    if not src.exists():
        if dst.exists():
            return
        print(f"SKIP missing: {src}")
        return
    if dst.exists():
        print(f"SKIP exists: {dst}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    print(f"MOVED {src.relative_to(ROOT)} -> {dst.relative_to(ROOT)}")


def move_components() -> dict[str, str]:
    """Returns import path replacements: old @/ path -> new @/ path."""
    replacements: dict[str, str] = {}
    components_dir = FRONTEND / "components"
    for filename, folder in COMPONENT_FOLDERS.items():
        src = components_dir / filename
        dst = components_dir / folder / filename
        stem = filename.replace(".tsx", "")
        old_import = f"@/components/{stem}"
        new_import = f"@/components/{folder}/{stem}"
        replacements[old_import] = new_import
        move_file(src, dst)
    return replacements


def move_lib() -> dict[str, str]:
    replacements: dict[str, str] = {}
    lib_dir = FRONTEND / "lib"
    for filename, folder in LIB_FOLDERS.items():
        src = lib_dir / filename
        dst = lib_dir / folder / filename
        stem = filename.replace(".ts", "")
        old_import = f"@/lib/{stem}"
        new_import = f"@/lib/{folder}/{stem}"
        replacements[old_import] = new_import
        move_file(src, dst)
    return replacements


def move_app_routes() -> None:
    app_dir = FRONTEND / "app"
    # Move home page into (platform) group
    platform_dir = app_dir / "(platform)"
    platform_dir.mkdir(parents=True, exist_ok=True)
    home_src = app_dir / "page.tsx"
    home_dst = platform_dir / "page.tsx"
    move_file(home_src, home_dst)

    for route, group in APP_ROUTE_GROUPS.items():
        src = app_dir / route
        if not src.exists():
            continue
        dst = app_dir / group / route
        move_file(src, dst)


def move_api() -> dict[str, str]:
    replacements: dict[str, str] = {}
    for filename, rel_dst in API_MOVES.items():
        src = API / filename
        dst = API / rel_dst
        module_old = filename.replace(".py", "")
        module_new = rel_dst.replace(".py", "").replace("/", ".")
        replacements[f"api.{module_old}"] = f"api.{module_new}"
        move_file(src, dst)

    # __init__.py for packages
    for pkg in ["middleware", "routes"]:
        init = API / pkg / "__init__.py"
        if not init.exists():
            init.write_text("", encoding="utf-8")
    return replacements


def apply_replacements_to_file(path: Path, replacements: dict[str, str]) -> bool:
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return False
    original = text
    # Sort by length descending to avoid partial replacements
    for old, new in sorted(replacements.items(), key=lambda x: len(x[0]), reverse=True):
        text = text.replace(old, new)
    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def rewrite_imports(component_repl: dict[str, str], lib_repl: dict[str, str], api_repl: dict[str, str]) -> int:
    all_repl = {**component_repl, **lib_repl, **api_repl}
    changed = 0
    patterns = ["**/*.ts", "**/*.tsx", "**/*.py", "**/*.mjs"]
    for pattern in patterns:
        for base in [FRONTEND, ROOT / "tests", API, ROOT / "scripts"]:
            if not base.exists():
                continue
            for path in base.glob(pattern):
                if "node_modules" in str(path) or ".next" in str(path):
                    continue
                if apply_replacements_to_file(path, all_repl):
                    changed += 1
                    print(f"UPDATED {path.relative_to(ROOT)}")
    return changed


def fix_middleware_class_names() -> None:
    """Update class imports after middleware rename."""
    main = API / "main.py"
    if not main.exists():
        return
    text = main.read_text(encoding="utf-8")
    text = text.replace(
        "from api.middleware.access import AccessControlMiddleware",
        "from api.middleware.access import AccessControlMiddleware",
    )
    # access_middleware exported AccessControlMiddleware from access_middleware.py
    # New file access.py - keep same class names in files
    main.write_text(text, encoding="utf-8")


def main() -> None:
    print("=== Moving API ===")
    api_repl = move_api()
    print("=== Moving components ===")
    comp_repl = move_components()
    print("=== Moving lib ===")
    lib_repl = move_lib()
    print("=== Moving app routes ===")
    move_app_routes()
    print("=== Rewriting imports ===")
    n = rewrite_imports(comp_repl, lib_repl, api_repl)
    print(f"=== Done: {n} files updated ===")


if __name__ == "__main__":
    main()
