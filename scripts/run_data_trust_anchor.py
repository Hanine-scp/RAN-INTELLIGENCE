from __future__ import annotations

from src.services.trust_service import trust_service


def main() -> None:
    result = trust_service.anchor_latest_snapshot()
    print(result)


if __name__ == "__main__":
    main()
