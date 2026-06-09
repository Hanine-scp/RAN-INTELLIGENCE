"""Operational spares tracking — stock réel vs besoin calculé lake."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from src.services.auth_database import auth_db_connect
from src.services.data_service import FilterContext, data_service


SPARES_TRACKING_SCHEMA = """
CREATE TABLE IF NOT EXISTS spares_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor TEXT NOT NULL DEFAULT 'nokia',
    product_code TEXT NOT NULL,
    object_type TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL DEFAULT '',
    stock_on_hand INTEGER NOT NULL DEFAULT 0,
    stock_reserved INTEGER NOT NULL DEFAULT 0,
    reorder_point INTEGER NOT NULL DEFAULT 0,
    warehouse_location TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE(vendor, product_code)
);

CREATE TABLE IF NOT EXISTS spares_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor TEXT NOT NULL DEFAULT 'nokia',
    product_code TEXT NOT NULL,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('in', 'out', 'adjustment')),
    quantity INTEGER NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spares_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor TEXT NOT NULL DEFAULT 'nokia',
    product_code TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
"""

SPARES_TRACKING_SCHEMA_POSTGRES = """
CREATE TABLE IF NOT EXISTS spares_inventory (
    id SERIAL PRIMARY KEY,
    vendor TEXT NOT NULL DEFAULT 'nokia',
    product_code TEXT NOT NULL,
    object_type TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL DEFAULT '',
    stock_on_hand INTEGER NOT NULL DEFAULT 0,
    stock_reserved INTEGER NOT NULL DEFAULT 0,
    reorder_point INTEGER NOT NULL DEFAULT 0,
    warehouse_location TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE(vendor, product_code)
);

CREATE TABLE IF NOT EXISTS spares_movements (
    id SERIAL PRIMARY KEY,
    vendor TEXT NOT NULL DEFAULT 'nokia',
    product_code TEXT NOT NULL,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('in', 'out', 'adjustment')),
    quantity INTEGER NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spares_alerts (
    id SERIAL PRIMARY KEY,
    vendor TEXT NOT NULL DEFAULT 'nokia',
    product_code TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
"""


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_spares_tracking_tables(conn) -> None:
    script = SPARES_TRACKING_SCHEMA_POSTGRES if conn.is_postgres else SPARES_TRACKING_SCHEMA
    conn.executescript(script)


class SparesTrackingService:
    def ensure_tables(self) -> None:
        with auth_db_connect() as conn:
            init_spares_tracking_tables(conn)

    def get_dashboard(self, ctx: FilterContext, horizon_days: int = 90) -> dict[str, Any]:
        self.ensure_tables()
        vendor = (ctx.vendor or "nokia").lower()
        computed = data_service.get_spares_dimensioning(ctx, horizon_days=horizon_days)

        with auth_db_connect() as conn:
            inventory_rows = conn.execute(
                """
                SELECT product_code, object_type, product_name, stock_on_hand, stock_reserved, reorder_point, warehouse_location, updated_at
                FROM spares_inventory
                WHERE vendor = ?
                ORDER BY product_code
                """,
                [vendor],
            ).fetchall()
            alerts = conn.execute(
                """
                SELECT product_code, alert_type, message, severity, created_at
                FROM spares_alerts
                WHERE vendor = ? AND resolved = 0
                ORDER BY created_at DESC
                LIMIT 20
                """,
                [vendor],
            ).fetchall()

        inventory_map = {str(r["product_code"]): dict(r) for r in inventory_rows}
        merged: list[dict[str, Any]] = []

        for row in computed.get("rows", [])[:50]:
            code = str(row.get("product_code") or "")
            inv = inventory_map.get(code, {})
            recommended = int(row.get("recommended_spares") or 0)
            on_hand = int(inv.get("stock_on_hand") or 0)
            gap = recommended - on_hand
            merged.append(
                {
                    "product_code": code,
                    "object_type": row.get("object_type"),
                    "recommended_spares": recommended,
                    "replacements_period": row.get("replacements_period"),
                    "stock_on_hand": on_hand,
                    "stock_reserved": int(inv.get("stock_reserved") or 0),
                    "reorder_point": int(inv.get("reorder_point") or 0),
                    "gap": gap,
                    "status": "critical" if gap > 5 else ("warning" if gap > 0 else "ok"),
                    "warehouse_location": inv.get("warehouse_location") or "",
                }
            )

        return {
            "vendor": vendor,
            "linked": True,
            "inventory_count": len(inventory_rows),
            "summary": {
                **computed.get("summary", {}),
                "tracked_products": len(inventory_rows),
                "open_alerts": len(alerts),
                "critical_gaps": len([m for m in merged if m["status"] == "critical"]),
            },
            "rows": merged,
            "alerts": [dict(a) for a in alerts],
            "note": "Stock réel alimenté via spares_inventory — prêt pour synchro entrepôt.",
        }


spares_tracking_service = SparesTrackingService()
