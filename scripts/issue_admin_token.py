#!/usr/bin/env python3
"""Affiche un JWT admin pour .env.identity (RAN_API_TOKEN) après login."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.env_loader import load_auth_env

load_auth_env()

from src.services.auth_service import auth_service


def main() -> int:
    import os

    email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "")
    if not email or not password:
        print("ERROR: ADMIN_EMAIL et ADMIN_PASSWORD requis dans .env.auth")
        return 1

    result = auth_service.login_user(email=email, password=password)
    token = result.get("access_token") or result.get("token")
    if not token:
        print("ERROR: login OK mais pas de token dans la réponse")
        print(json.dumps(result, indent=2, default=str)[:500])
        return 1

    print("Copiez dans .env.identity :")
    print(f"RAN_API_TOKEN={token}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
