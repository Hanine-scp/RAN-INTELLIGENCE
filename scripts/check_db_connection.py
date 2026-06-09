#!/usr/bin/env python3
"""Vérifie la connexion PostgreSQL / SQLite de la plateforme."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from src.services.auth_database import check_database_connection


def main() -> int:
    status = check_database_connection()
    print(json.dumps(status, indent=2, ensure_ascii=False))
    if not status.get("connected"):
        print("\n❌ NON CONNECTÉ")
        if status.get("error"):
            print(f"   Erreur: {status['error']}")
        return 1
    print(f"\n✅ CONNECTÉ — {status['engine']} — {len(status.get('tables', []))} tables")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
