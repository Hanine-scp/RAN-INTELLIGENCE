#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from config.settings import RAW_DATA_PATH
from src.parsers.nokia_parser_audit import (
    DEFAULT_REPORT_DIR,
    run_corpus_audit,
    save_audit_report,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Audit all Nokia XML files under DATA.XML, validate parsing, "
            "and write a summary report."
        )
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=RAW_DATA_PATH,
        help=f"DATA.XML root (default: {RAW_DATA_PATH})",
    )
    parser.add_argument(
        "--snapshot",
        type=str,
        default=None,
        help="Optional snapshot folder, e.g. 2026.05.14",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Search XML recursively under each snapshot folder.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit number of XML files (smoke test).",
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=0,
        help="Parallel workers (0 = sequential, recommended on Windows).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_REPORT_DIR,
        help=f"Report output directory (default: {DEFAULT_REPORT_DIR})",
    )
    parser.add_argument(
        "--fail-on-error",
        action="store_true",
        help="Exit with code 1 if any file fails to parse.",
    )
    parser.add_argument(
        "--fail-on-warning",
        action="store_true",
        help="Exit with code 1 if any warning is raised.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    def on_progress(index: int, total: int, result) -> None:
        print(
            f"[AUDIT] {index:,}/{total:,} "
            f"last={Path(result.xml_path).name} status={result.status}",
            flush=True,
        )

    summary = run_corpus_audit(
        args.source,
        snapshot=args.snapshot,
        recursive=args.recursive,
        limit=args.limit,
        max_workers=args.max_workers,
        on_progress=on_progress,
    )

    paths = save_audit_report(summary, args.output_dir)
    print()
    print(f"Files audited: {summary.total_files:,}")
    print(f"Parse success: {summary.parse_success_rate}% ({summary.parsed_count:,}/{summary.total_files:,})")
    print(f"Strict OK: {summary.strict_success_rate}% ({summary.ok_count:,})")
    print(f"Acceptable: {summary.acceptable_rate}% | Warnings: {summary.warning_count:,} | Errors: {summary.error_count:,}")
    print(f"Equipment: {summary.equipment_total:,} | Cells: {summary.cells_total:,}")
    print()
    print("Reports written:")
    for label, path in paths.items():
        print(f"  - {label}: {path}")

    if args.fail_on_error and summary.error_count > 0:
        return 1
    if args.fail_on_warning and summary.warning_count > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
