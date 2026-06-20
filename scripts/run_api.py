#!/usr/bin/env python3
"""Production API launcher with configurable uvicorn workers."""

from __future__ import annotations

import os
import subprocess
import sys


def main() -> int:
    host = os.getenv("API_HOST", "0.0.0.0")
    port = os.getenv("API_PORT", "8000")
    workers = int(os.getenv("UVICORN_WORKERS", "1"))
    reload = os.getenv("API_RELOAD", "false").lower() in {"1", "true", "yes"}

    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "api.main:app",
        "--host",
        host,
        "--port",
        port,
    ]
    if reload:
        cmd.append("--reload")
    elif workers > 1:
        cmd.extend(["--workers", str(workers)])

    print(f"Starting API: {' '.join(cmd)}", flush=True)
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
