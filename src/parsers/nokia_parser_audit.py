from __future__ import annotations

import json
import os
import re
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Optional

from src.parsers.nokia_parser import DEFAULT_DATA_XML_ROOT, normalize_date, parse_xml_file

DATE_FOLDER_PATTERN = re.compile(r"^\d{4}[.\-_]\d{2}[.\-_]\d{2}$")
MRBTS_FILENAME_PATTERN = re.compile(r"^MRBTS(.+)\.xml$", re.IGNORECASE)
DEFAULT_REPORT_DIR = Path("data/exports/nokia_parser_audit")
PARSER_MODULE = "src.parsers.nokia_parser"

AUDIT_CONVENTIONS: tuple[tuple[str, str, str], ...] = (
    (
        "parse_no_exception",
        "XML file is read and parsed without raising an exception.",
        "critical",
    ),
    (
        "filename_mrbts",
        "Input file follows Nokia export naming: MRBTS{site_id}.xml.",
        "convention",
    ),
    (
        "site_extracted",
        "Parser extracts a site_id from the MRBTS managedObject.",
        "critical",
    ),
    (
        "site_id_matches_filename",
        "Extracted site_id matches the ID encoded in the XML filename.",
        "quality",
    ),
    (
        "has_equipment",
        "At least one equipment row is produced (CABINET/SMOD/RMOD/BBMOD/RETU/ALD/ANTL).",
        "quality",
    ),
    (
        "has_cells",
        "At least one radio cell is counted (2G/3G/4G/5G).",
        "quality",
    ),
)

WARNING_LABELS: dict[str, str] = {
    "missing_site": "No site_id extracted from XML (MRBTS object missing or empty).",
    "zero_equipment": "Parse succeeded but produced zero equipment rows.",
    "zero_cells": "Parse succeeded but site has zero counted cells.",
    "site_id_mismatch": "Filename site_id differs from parsed site_id.",
}


@dataclass(frozen=True)
class FileAuditResult:
    xml_path: str
    date_folder: str
    status: str
    parsed: bool = True
    site_id: Optional[str] = None
    site_name: Optional[str] = None
    equipment_count: int = 0
    nb_cells: int = 0
    nb_cells_2g: int = 0
    nb_cells_3g: int = 0
    nb_cells_lte_4g: int = 0
    nb_cells_5g: int = 0
    technologies: Optional[str] = None
    equipment_by_type: tuple[tuple[str, int], ...] = ()
    conventions_passed: tuple[str, ...] = ()
    conventions_failed: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    error: Optional[str] = None
    duration_ms: int = 0

    @property
    def ok(self) -> bool:
        return self.status == "ok"

    @property
    def is_warning(self) -> bool:
        return self.status == "warning"

    @property
    def is_error(self) -> bool:
        return self.status == "error"

    def equipment_type_map(self) -> dict[str, int]:
        return dict(self.equipment_by_type)


@dataclass
class ConventionCheckResult:
    rule_id: str
    label: str
    severity: str
    passed: int = 0
    failed: int = 0

    @property
    def total(self) -> int:
        return self.passed + self.failed

    @property
    def pass_rate(self) -> float:
        if self.total == 0:
            return 0.0
        return round((self.passed / self.total) * 100, 2)


@dataclass
class SnapshotAuditSummary:
    date_folder: str
    snapshot_date: str
    total_files: int = 0
    parsed_count: int = 0
    ok_count: int = 0
    warning_count: int = 0
    error_count: int = 0
    equipment_total: int = 0
    cells_total: int = 0
    cells_2g_total: int = 0
    cells_3g_total: int = 0
    cells_lte_4g_total: int = 0
    cells_5g_total: int = 0
    warning_codes: dict[str, int] = field(default_factory=dict)
    equipment_by_type: dict[str, int] = field(default_factory=dict)
    errors: list[FileAuditResult] = field(default_factory=list)
    warnings: list[FileAuditResult] = field(default_factory=list)

    @property
    def parse_success_rate(self) -> float:
        return _rate(self.parsed_count, self.total_files)

    @property
    def strict_success_rate(self) -> float:
        return _rate(self.ok_count, self.total_files)

    @property
    def acceptable_rate(self) -> float:
        return _rate(self.ok_count + self.warning_count, self.total_files)

    @property
    def error_rate(self) -> float:
        return _rate(self.error_count, self.total_files)


@dataclass
class CorpusAuditSummary:
    source_root: str
    parser_module: str
    started_at: str
    finished_at: str
    duration_seconds: float
    total_files: int = 0
    parsed_count: int = 0
    ok_count: int = 0
    warning_count: int = 0
    error_count: int = 0
    equipment_total: int = 0
    cells_total: int = 0
    cells_2g_total: int = 0
    cells_3g_total: int = 0
    cells_lte_4g_total: int = 0
    cells_5g_total: int = 0
    avg_equipment_per_site: float = 0.0
    avg_cells_per_site: float = 0.0
    snapshots: list[SnapshotAuditSummary] = field(default_factory=list)
    warning_codes: dict[str, int] = field(default_factory=dict)
    equipment_by_type: dict[str, int] = field(default_factory=dict)
    conventions: list[ConventionCheckResult] = field(default_factory=list)
    error_samples: list[FileAuditResult] = field(default_factory=list)
    warning_samples: list[FileAuditResult] = field(default_factory=list)

    @property
    def success_rate(self) -> float:
        return self.strict_success_rate

    @property
    def parse_success_rate(self) -> float:
        return _rate(self.parsed_count, self.total_files)

    @property
    def strict_success_rate(self) -> float:
        return _rate(self.ok_count, self.total_files)

    @property
    def acceptable_rate(self) -> float:
        return _rate(self.ok_count + self.warning_count, self.total_files)

    @property
    def error_rate(self) -> float:
        return _rate(self.error_count, self.total_files)

    @property
    def warning_rate(self) -> float:
        return _rate(self.warning_count, self.total_files)


def _rate(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return round((numerator / denominator) * 100, 2)


def _pct(value: float) -> str:
    return f"{value:.2f}%"


def _merge_type_counts(target: dict[str, int], items: Iterable[tuple[str, int]]) -> None:
    for key, count in items:
        target[key] = target.get(key, 0) + count


def _evaluate_conventions(
    *,
    xml_path: Path,
    site_id: Optional[str],
    equipment_count: int,
    nb_cells: int,
    warnings: Iterable[str],
    parsed: bool,
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    passed: list[str] = []
    failed: list[str] = []
    warning_set = set(warnings)
    expected_id = expected_site_id_from_filename(xml_path.name)
    is_mrbts_file = expected_id is not None

    checks = {
        "parse_no_exception": parsed,
        "filename_mrbts": is_mrbts_file,
        "site_extracted": bool(site_id),
        "site_id_matches_filename": "site_id_mismatch" not in {
            w.split(":", 1)[0] for w in warning_set
        }
        and (not is_mrbts_file or bool(site_id)),
        "has_equipment": equipment_count > 0,
        "has_cells": nb_cells > 0,
    }

    for rule_id, _, _ in AUDIT_CONVENTIONS:
        if rule_id in {"site_extracted", "site_id_matches_filename"} and not is_mrbts_file:
            continue
        if checks.get(rule_id, False):
            passed.append(rule_id)
        else:
            failed.append(rule_id)

    return tuple(passed), tuple(failed)


def normalize_folder_date(folder_name: str) -> str:
    return folder_name.strip().replace(".", "-").replace("_", "-")


def is_date_folder(path: Path) -> bool:
    return path.is_dir() and bool(DATE_FOLDER_PATTERN.match(path.name.strip()))


def expected_site_id_from_filename(filename: str) -> Optional[str]:
    match = MRBTS_FILENAME_PATTERN.match(filename.strip())
    if not match:
        return None
    return match.group(1)


def discover_corpus_files(
    source_root: Path,
    *,
    snapshot: Optional[str] = None,
    recursive: bool = False,
    limit: Optional[int] = None,
) -> list[tuple[str, Path]]:
    root = source_root.resolve()
    if not root.exists():
        raise FileNotFoundError(f"Dossier source introuvable: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"Le chemin source n'est pas un dossier: {root}")

    snapshot_filter = snapshot.strip().replace("-", ".") if snapshot else None
    entries: list[tuple[str, Path]] = []

    for folder in sorted(root.iterdir(), key=lambda p: p.name):
        if not is_date_folder(folder):
            continue
        if snapshot_filter and folder.name != snapshot_filter:
            continue

        pattern = "**/*.xml" if recursive else "*.xml"
        xml_files = sorted(
            p for p in folder.glob(pattern)
            if p.is_file() and p.suffix.lower() == ".xml"
        )
        for xml_path in xml_files:
            entries.append((folder.name, xml_path))
            if limit is not None and len(entries) >= limit:
                return entries

    if not entries:
        raise FileNotFoundError(
            f"Aucun fichier XML Nokia trouvé dans {root}"
            + (f" (snapshot={snapshot_filter})" if snapshot_filter else "")
        )

    return entries


def _equipment_type_counts(equipment: list[dict[str, Any]]) -> dict[str, int]:
    counter: Counter[str] = Counter()
    for row in equipment:
        object_type = str(row.get("object_type") or row.get("base_object_type") or "UNKNOWN")
        counter[object_type] += 1
    return dict(counter)


def audit_xml_file(
    xml_path: Path,
    *,
    date_folder: str,
    source_root: Path,
) -> FileAuditResult:
    started = time.perf_counter()
    rel_path = str(xml_path)
    warnings: list[str] = []

    try:
        result = parse_xml_file(
            xml_path,
            forced_snapshot_date=normalize_date(date_folder),
            date_folder=date_folder,
            source_root=source_root,
        )
        site = result.get("site")
        equipment = result.get("equipment") or []

        site_id = site.get("site_id") if site else None
        site_name = site.get("site_name") if site else None
        nb_cells = int(site.get("nb_cells") or 0) if site else 0
        nb_cells_2g = int(site.get("nb_cells_2g") or 0) if site else 0
        nb_cells_3g = int(site.get("nb_cells_3g") or 0) if site else 0
        nb_cells_lte_4g = int(site.get("nb_cells_lte_4g") or 0) if site else 0
        nb_cells_5g = int(site.get("nb_cells_5g") or 0) if site else 0
        technologies = site.get("technologies") if site else None
        equipment_count = len(equipment)
        equipment_by_type = _equipment_type_counts(equipment)

        expected_id = expected_site_id_from_filename(xml_path.name)
        if expected_id and site_id and str(site_id) != str(expected_id):
            warnings.append(f"site_id_mismatch:{expected_id}!={site_id}")

        if not site or not site_id:
            warnings.append("missing_site")

        if equipment_count == 0:
            warnings.append("zero_equipment")

        if nb_cells == 0 and site:
            warnings.append("zero_cells")

        conventions_passed, conventions_failed = _evaluate_conventions(
            xml_path=xml_path,
            site_id=str(site_id) if site_id is not None else None,
            equipment_count=equipment_count,
            nb_cells=nb_cells,
            warnings=warnings,
            parsed=True,
        )

        if warnings:
            status = "error" if "missing_site" in warnings and expected_id else "warning"
        else:
            status = "ok"

        duration_ms = int((time.perf_counter() - started) * 1000)
        return FileAuditResult(
            xml_path=rel_path,
            date_folder=date_folder,
            status=status,
            parsed=True,
            site_id=str(site_id) if site_id is not None else None,
            site_name=str(site_name) if site_name is not None else None,
            equipment_count=equipment_count,
            nb_cells=nb_cells,
            nb_cells_2g=nb_cells_2g,
            nb_cells_3g=nb_cells_3g,
            nb_cells_lte_4g=nb_cells_lte_4g,
            nb_cells_5g=nb_cells_5g,
            technologies=str(technologies) if technologies else None,
            equipment_by_type=tuple(sorted(equipment_by_type.items())),
            conventions_passed=conventions_passed,
            conventions_failed=conventions_failed,
            warnings=tuple(warnings),
            duration_ms=duration_ms,
        )
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        conventions_passed, conventions_failed = _evaluate_conventions(
            xml_path=xml_path,
            site_id=None,
            equipment_count=0,
            nb_cells=0,
            warnings=(),
            parsed=False,
        )
        return FileAuditResult(
            xml_path=rel_path,
            date_folder=date_folder,
            status="error",
            parsed=False,
            warnings=(),
            conventions_passed=conventions_passed,
            conventions_failed=conventions_failed,
            error=f"{type(exc).__name__}: {exc}",
            duration_ms=duration_ms,
        )


def _audit_worker(args: tuple[str, str, str]) -> dict[str, Any]:
    date_folder, xml_path_str, source_root_str = args
    result = audit_xml_file(
        Path(xml_path_str),
        date_folder=date_folder,
        source_root=Path(source_root_str),
    )
    return asdict(result)


def _accumulate_warning_codes(target: dict[str, int], warnings: Iterable[str]) -> None:
    for code in warnings:
        key = code.split(":", 1)[0]
        target[key] = target.get(key, 0) + 1


def _finalize_conventions(results: list[FileAuditResult]) -> list[ConventionCheckResult]:
    rule_map = {rule_id: (label, severity) for rule_id, label, severity in AUDIT_CONVENTIONS}
    totals: dict[str, ConventionCheckResult] = {}

    for rule_id, label, severity in AUDIT_CONVENTIONS:
        totals[rule_id] = ConventionCheckResult(
            rule_id=rule_id,
            label=label,
            severity=severity,
        )

    for result in results:
        for rule_id in result.conventions_passed:
            if rule_id in totals:
                totals[rule_id].passed += 1
        for rule_id in result.conventions_failed:
            if rule_id in totals:
                totals[rule_id].failed += 1

    return list(totals.values())


def run_corpus_audit(
    source_root: Optional[Path] = None,
    *,
    snapshot: Optional[str] = None,
    recursive: bool = False,
    limit: Optional[int] = None,
    max_workers: int = 0,
    progress_every: int = 100,
    on_progress: Optional[Callable[[int, int, FileAuditResult], None]] = None,
) -> CorpusAuditSummary:
    root = (source_root or DEFAULT_DATA_XML_ROOT).resolve()
    started = datetime.now(timezone.utc)
    t0 = time.perf_counter()

    files = discover_corpus_files(
        root,
        snapshot=snapshot,
        recursive=recursive,
        limit=limit,
    )

    snapshot_map: dict[str, SnapshotAuditSummary] = {}
    results: list[FileAuditResult] = []

    tasks = [(date_folder, str(xml_path), str(root)) for date_folder, xml_path in files]

    def consume(result_dict: dict[str, Any], index: int) -> None:
        result = FileAuditResult(**result_dict)
        results.append(result)

        snap = snapshot_map.setdefault(
            result.date_folder,
            SnapshotAuditSummary(
                date_folder=result.date_folder,
                snapshot_date=normalize_date(result.date_folder) or result.date_folder,
            ),
        )
        snap.total_files += 1
        if result.parsed:
            snap.parsed_count += 1
        snap.equipment_total += result.equipment_count
        snap.cells_total += result.nb_cells
        snap.cells_2g_total += result.nb_cells_2g
        snap.cells_3g_total += result.nb_cells_3g
        snap.cells_lte_4g_total += result.nb_cells_lte_4g
        snap.cells_5g_total += result.nb_cells_5g
        _merge_type_counts(snap.equipment_by_type, result.equipment_by_type)

        if result.status == "ok":
            snap.ok_count += 1
        elif result.status == "warning":
            snap.warning_count += 1
            snap.warnings.append(result)
            _accumulate_warning_codes(snap.warning_codes, result.warnings)
        else:
            snap.error_count += 1
            snap.errors.append(result)

        if on_progress and (index % progress_every == 0 or index == len(tasks)):
            on_progress(index, len(tasks), result)

    if max_workers == 0:
        for index, task in enumerate(tasks, start=1):
            consume(_audit_worker(task), index)
    else:
        workers = max_workers if max_workers > 0 else max(1, (os.cpu_count() or 4) - 1)
        with ProcessPoolExecutor(max_workers=workers) as executor:
            for index, result_dict in enumerate(executor.map(_audit_worker, tasks), start=1):
                consume(result_dict, index)

    finished = datetime.now(timezone.utc)
    duration = time.perf_counter() - t0

    summary = CorpusAuditSummary(
        source_root=str(root),
        parser_module=PARSER_MODULE,
        started_at=started.isoformat(),
        finished_at=finished.isoformat(),
        duration_seconds=round(duration, 2),
        total_files=len(results),
        snapshots=sorted(snapshot_map.values(), key=lambda s: s.date_folder),
    )

    warning_codes: dict[str, int] = {}
    equipment_by_type: dict[str, int] = {}
    sites_with_data = 0

    for result in results:
        if result.parsed:
            summary.parsed_count += 1
        if result.site_id:
            sites_with_data += 1

        summary.cells_2g_total += result.nb_cells_2g
        summary.cells_3g_total += result.nb_cells_3g
        summary.cells_lte_4g_total += result.nb_cells_lte_4g
        summary.cells_5g_total += result.nb_cells_5g
        _merge_type_counts(equipment_by_type, result.equipment_by_type)

        if result.status == "ok":
            summary.ok_count += 1
        elif result.status == "warning":
            summary.warning_count += 1
            if len(summary.warning_samples) < 25:
                summary.warning_samples.append(result)
        else:
            summary.error_count += 1
            if len(summary.error_samples) < 50:
                summary.error_samples.append(result)

        _accumulate_warning_codes(warning_codes, result.warnings)

    summary.equipment_total = sum(s.equipment_total for s in summary.snapshots)
    summary.cells_total = sum(s.cells_total for s in summary.snapshots)
    summary.warning_codes = warning_codes
    summary.equipment_by_type = equipment_by_type
    summary.conventions = _finalize_conventions(results)
    summary.avg_equipment_per_site = round(
        summary.equipment_total / sites_with_data, 2
    ) if sites_with_data else 0.0
    summary.avg_cells_per_site = round(
        summary.cells_total / sites_with_data, 2
    ) if sites_with_data else 0.0
    return summary


def render_summary_text(summary: CorpusAuditSummary) -> str:
    lines = [
        "Nokia parser corpus audit",
        "=" * 72,
        f"Parser: {summary.parser_module}",
        f"Source: {summary.source_root}",
        f"Started: {summary.started_at}",
        f"Finished: {summary.finished_at}",
        f"Duration: {summary.duration_seconds:.1f}s",
        "",
        "Quality rates:",
        f"  Parse success: {summary.parse_success_rate}% ({summary.parsed_count:,}/{summary.total_files:,})",
        f"  Strict OK: {summary.strict_success_rate}% ({summary.ok_count:,}/{summary.total_files:,})",
        f"  Acceptable (OK+warn): {summary.acceptable_rate}%",
        f"  Warnings: {summary.warning_rate}% ({summary.warning_count:,})",
        f"  Errors: {summary.error_rate}% ({summary.error_count:,})",
        "",
        "Parsed content totals:",
        f"  Sites with site_id: {summary.total_files - summary.error_count:,}",
        f"  Equipment rows: {summary.equipment_total:,} (avg {summary.avg_equipment_per_site}/site)",
        f"  Cells: {summary.cells_total:,} (avg {summary.avg_cells_per_site}/site)",
        f"    2G={summary.cells_2g_total:,} 3G={summary.cells_3g_total:,} "
        f"4G={summary.cells_lte_4g_total:,} 5G={summary.cells_5g_total:,}",
        "",
        "By snapshot:",
    ]

    for snap in summary.snapshots:
        lines.append(
            f"  - {snap.date_folder}: files={snap.total_files:,} "
            f"parse={snap.parse_success_rate}% strict_ok={snap.strict_success_rate}% "
            f"warn={snap.warning_count:,} err={snap.error_count:,} "
            f"equipment={snap.equipment_total:,} cells={snap.cells_total:,}"
        )

    if summary.equipment_by_type:
        lines.extend(["", "Equipment by type:"])
        for object_type, count in sorted(summary.equipment_by_type.items(), key=lambda x: (-x[1], x[0])):
            lines.append(f"  - {object_type}: {count:,}")

    if summary.conventions:
        lines.extend(["", "Convention checks:"])
        for check in summary.conventions:
            if check.total == 0:
                continue
            lines.append(
                f"  - [{check.severity}] {check.rule_id}: "
                f"{check.pass_rate}% pass ({check.passed:,}/{check.total:,})"
            )

    if summary.warning_codes:
        lines.extend(["", "Warning codes:"])
        for code, count in sorted(summary.warning_codes.items(), key=lambda x: (-x[1], x[0])):
            label = WARNING_LABELS.get(code, code)
            lines.append(f"  - {code}: {count:,} — {label}")

    if summary.error_samples:
        lines.extend(["", "Error samples:"])
        for item in summary.error_samples:
            lines.append(f"  - {item.xml_path}: {item.error or item.warnings}")

    lines.append("=" * 72)
    return "\n".join(lines)


def render_summary_markdown(summary: CorpusAuditSummary) -> str:
    lines = [
        "# Nokia parser corpus audit",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Parser | `{summary.parser_module}` |",
        f"| Source | `{summary.source_root}` |",
        f"| Duration | {summary.duration_seconds:.1f}s |",
        f"| Files | {summary.total_files:,} |",
        f"| Parse success | {summary.parse_success_rate}% |",
        f"| Strict OK | {summary.strict_success_rate}% |",
        f"| Acceptable (OK+warn) | {summary.acceptable_rate}% |",
        f"| Warnings | {summary.warning_count:,} ({summary.warning_rate}%) |",
        f"| Errors | {summary.error_count:,} ({summary.error_rate}%) |",
        f"| Equipment rows | {summary.equipment_total:,} |",
        f"| Cells | {summary.cells_total:,} |",
        "",
        "## Snapshots",
        "",
        "| Snapshot | Files | Parse % | Strict OK % | Warn | Err | Equipment | Cells |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]

    for snap in summary.snapshots:
        lines.append(
            f"| {snap.date_folder} | {snap.total_files:,} | {snap.parse_success_rate}% | "
            f"{snap.strict_success_rate}% | {snap.warning_count:,} | {snap.error_count:,} | "
            f"{snap.equipment_total:,} | {snap.cells_total:,} |"
        )

    if summary.conventions:
        lines.extend(
            [
                "",
                "## Convention checks",
                "",
                "| Rule | Severity | Pass % | Passed | Failed |",
                "| --- | --- | ---: | ---: | ---: |",
            ]
        )
        for check in summary.conventions:
            if check.total == 0:
                continue
            lines.append(
                f"| {check.rule_id} | {check.severity} | {check.pass_rate}% | "
                f"{check.passed:,} | {check.failed:,} |"
            )

    return "\n".join(lines)


def save_audit_pdf(summary: CorpusAuditSummary, pdf_path: Path) -> None:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.4 * cm,
        bottomMargin=1.4 * cm,
        title="Nokia Parser Audit Report",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "AuditTitle",
        parent=styles["Heading1"],
        fontSize=20,
        textColor=colors.HexColor("#111827"),
        spaceAfter=8,
    )
    subtitle_style = ParagraphStyle(
        "AuditSubtitle",
        parent=styles["BodyText"],
        fontSize=9,
        textColor=colors.HexColor("#4b5563"),
        leading=12,
    )
    section_style = ParagraphStyle(
        "AuditSection",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#111827"),
        spaceBefore=10,
        spaceAfter=5,
    )
    body_style = ParagraphStyle(
        "AuditBody",
        parent=styles["BodyText"],
        fontSize=8,
        leading=11,
    )
    small_style = ParagraphStyle(
        "AuditSmall",
        parent=body_style,
        fontSize=7,
        textColor=colors.HexColor("#374151"),
    )
    kpi_value_style = ParagraphStyle(
        "KpiValue",
        parent=styles["Heading2"],
        fontSize=16,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#111827"),
    )
    kpi_label_style = ParagraphStyle(
        "KpiLabel",
        parent=small_style,
        alignment=TA_CENTER,
    )

    def styled_table(
        data: list[list[Any]],
        col_widths: Optional[list[float]] = None,
        *,
        header_fill: str = "#111827",
        right_from_col: int = 1,
    ) -> Table:
        wrapped: list[list[Any]] = []
        for row_idx, row in enumerate(data):
            wrapped_row: list[Any] = []
            for col_idx, cell in enumerate(row):
                if row_idx == 0 or not isinstance(cell, str):
                    wrapped_row.append(cell)
                else:
                    wrapped_row.append(Paragraph(cell.replace("\n", "<br/>"), body_style))
            wrapped.append(wrapped_row)

        tbl = Table(wrapped, colWidths=col_widths, hAlign="LEFT", repeatRows=1)
        style_cmds = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_fill)),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        if right_from_col <= len(data[0]) - 1:
            style_cmds.append(("ALIGN", (right_from_col, 1), (-1, -1), "RIGHT"))
        tbl.setStyle(TableStyle(style_cmds))
        return tbl

    def kpi_card(value: str, label: str, color: str) -> Table:
        card = Table(
            [[Paragraph(value, kpi_value_style)], [Paragraph(label, kpi_label_style)]],
            colWidths=[4.1 * cm],
        )
        card.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(color)),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        return card

    overall_status = "PASS"
    status_color = "#ecfdf5"
    if summary.error_count > 0:
        overall_status = "FAIL"
        status_color = "#fef2f2"
    elif summary.warning_count > 0:
        overall_status = "PASS WITH WARNINGS"
        status_color = "#fffbeb"

    story: list[Any] = [
        Paragraph("Nokia Parser Audit Report", title_style),
        Paragraph(
            f"<b>Guardian Nexus AI · RAN XML validation</b><br/>"
            f"Parser module: {summary.parser_module}<br/>"
            f"Source root: {summary.source_root}<br/>"
            f"Run window: {summary.started_at} → {summary.finished_at}<br/>"
            f"Duration: {summary.duration_seconds:.1f}s · Files audited: {summary.total_files:,}",
            subtitle_style,
        ),
        Spacer(1, 0.25 * cm),
        Table(
            [[Paragraph(f"<b>Overall result: {overall_status}</b>", body_style)]],
            colWidths=[16.8 * cm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(status_color)),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            ),
        ),
        Spacer(1, 0.3 * cm),
        Table(
            [
                [
                    kpi_card(_pct(summary.parse_success_rate), "Parse success", "#eff6ff"),
                    kpi_card(_pct(summary.strict_success_rate), "Strict OK", "#ecfdf5"),
                    kpi_card(_pct(summary.acceptable_rate), "Acceptable", "#f5f3ff"),
                    kpi_card(_pct(summary.error_rate), "Errors", "#fef2f2"),
                ]
            ],
            colWidths=[4.2 * cm, 4.2 * cm, 4.2 * cm, 4.2 * cm],
        ),
        Spacer(1, 0.35 * cm),
        Paragraph("1. What the parser extracts", section_style),
        Paragraph(
            "Each Nokia MRBTS XML file is parsed into one site record and zero or more "
            "equipment rows (CABINET, SMOD, RMOD, BBMOD, RETU, ALD, ANTL), plus radio "
            "cell counters by technology (2G, 3G, LTE/4G, 5G).",
            body_style,
        ),
        styled_table(
            [
                ["Parsed artifact", "Total", "Average per site"],
                ["Sites with extracted site_id", f"{summary.parsed_count:,}", "1.00"],
                ["Equipment rows (raw inventory)", f"{summary.equipment_total:,}", f"{summary.avg_equipment_per_site:.2f}"],
                ["Cells (all technologies)", f"{summary.cells_total:,}", f"{summary.avg_cells_per_site:.2f}"],
                ["2G cells", f"{summary.cells_2g_total:,}", ""],
                ["3G cells", f"{summary.cells_3g_total:,}", ""],
                ["LTE / 4G cells", f"{summary.cells_lte_4g_total:,}", ""],
                ["5G cells", f"{summary.cells_5g_total:,}", ""],
            ],
            col_widths=[7.5 * cm, 4.5 * cm, 4.8 * cm],
        ),
    ]

    if summary.equipment_by_type:
        story.extend(
            [
                Spacer(1, 0.25 * cm),
                styled_table(
                    [
                        ["Equipment type", "Rows parsed"],
                        *[
                            [object_type, f"{count:,}"]
                            for object_type, count in sorted(
                                summary.equipment_by_type.items(),
                                key=lambda x: (-x[1], x[0]),
                            )
                        ],
                    ],
                    col_widths=[10 * cm, 6.8 * cm],
                ),
            ]
        )

    story.extend(
        [
            PageBreak(),
            Paragraph("2. File-level quality by snapshot", section_style),
            styled_table(
                [
                    [
                        "Snapshot",
                        "Files",
                        "Parse %",
                        "Strict OK %",
                        "Warn",
                        "Err",
                        "Equipment",
                        "Cells",
                    ],
                    *[
                        [
                            snap.date_folder,
                            f"{snap.total_files:,}",
                            _pct(snap.parse_success_rate),
                            _pct(snap.strict_success_rate),
                            f"{snap.warning_count:,}",
                            f"{snap.error_count:,}",
                            f"{snap.equipment_total:,}",
                            f"{snap.cells_total:,}",
                        ]
                        for snap in summary.snapshots
                    ],
                ],
                col_widths=[2.3 * cm, 1.3 * cm, 1.5 * cm, 1.7 * cm, 1.2 * cm, 1.1 * cm, 2.0 * cm, 1.4 * cm],
            ),
            Spacer(1, 0.35 * cm),
            Paragraph("3. Test conventions & good practices", section_style),
            Paragraph(
                "Automated checks applied to each XML file. "
                "<b>critical</b> = must pass for a valid production export; "
                "<b>quality</b> = data completeness signals; "
                "<b>convention</b> = naming/layout expectation.",
                body_style,
            ),
            styled_table(
                [
                    ["Rule", "Severity", "Description", "Pass %", "Passed", "Failed"],
                    *[
                        [
                            check.rule_id,
                            check.severity,
                            check.label,
                            _pct(check.pass_rate),
                            f"{check.passed:,}",
                            f"{check.failed:,}",
                        ]
                        for check in summary.conventions
                        if check.total > 0
                    ],
                ],
                col_widths=[2.5 * cm, 1.5 * cm, 6.3 * cm, 1.5 * cm, 1.5 * cm, 1.5 * cm],
                right_from_col=3,
            ),
        ]
    )

    if summary.warning_codes:
        story.extend(
            [
                Spacer(1, 0.35 * cm),
                Paragraph("4. Warning breakdown", section_style),
                styled_table(
                    [
                        ["Code", "Count", "% of files", "Meaning"],
                        *[
                            [
                                code,
                                f"{count:,}",
                                _pct(_rate(count, summary.total_files)),
                                WARNING_LABELS.get(code, "See issues CSV for details."),
                            ]
                            for code, count in sorted(
                                summary.warning_codes.items(),
                                key=lambda x: (-x[1], x[0]),
                            )
                        ],
                    ],
                    col_widths=[2.5 * cm, 1.5 * cm, 1.5 * cm, 11.3 * cm],
                    right_from_col=1,
                ),
            ]
        )

    issue_rows: list[list[str]] = []
    for snap in summary.snapshots:
        for item in snap.errors:
            issue_rows.append(
                [
                    "ERROR",
                    snap.date_folder,
                    Path(item.xml_path).name,
                    item.site_id or "-",
                    item.error or ", ".join(item.warnings),
                ]
            )
        for item in snap.warnings[:10]:
            issue_rows.append(
                [
                    "WARN",
                    snap.date_folder,
                    Path(item.xml_path).name,
                    item.site_id or "-",
                    ", ".join(item.warnings),
                ]
            )

    if issue_rows:
        story.extend(
            [
                PageBreak(),
                Paragraph("5. Issues detail", section_style),
                Paragraph(
                    f"Showing {len(issue_rows):,} issue rows "
                    f"({summary.error_count:,} errors, {summary.warning_count:,} warnings total). "
                    "Full list exported to the companion CSV.",
                    body_style,
                ),
                styled_table(
                    [
                        ["Level", "Snapshot", "File", "Site ID", "Detail"],
                        *issue_rows[:60],
                    ],
                    col_widths=[1.2 * cm, 2.0 * cm, 2.8 * cm, 1.5 * cm, 9.3 * cm],
                ),
            ]
        )
    else:
        story.extend(
            [
                Spacer(1, 0.35 * cm),
                Paragraph("5. Issues detail", section_style),
                Paragraph("No warnings or errors detected for this run.", body_style),
            ]
        )

    story.extend(
        [
            Spacer(1, 0.35 * cm),
            Paragraph(
                "Method: sequential/parallel audit via parse_xml_file(); "
                "strict OK = no validation warnings; acceptable = parsed with warnings only.",
                small_style,
            ),
        ]
    )

    doc.build(story)


def save_audit_report(
    summary: CorpusAuditSummary,
    output_dir: Path = DEFAULT_REPORT_DIR,
    *,
    prefix: Optional[str] = None,
) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = prefix or datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    json_path = output_dir / f"nokia_parser_audit_{stamp}.json"
    md_path = output_dir / f"nokia_parser_audit_{stamp}.md"
    txt_path = output_dir / f"nokia_parser_audit_{stamp}.txt"
    pdf_path = output_dir / f"nokia_parser_audit_{stamp}.pdf"

    payload = asdict(summary)
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    md_path.write_text(render_summary_markdown(summary), encoding="utf-8")
    txt_path.write_text(render_summary_text(summary), encoding="utf-8")
    save_audit_pdf(summary, pdf_path)

    failures: list[dict[str, Any]] = []
    for snap in summary.snapshots:
        for item in snap.errors + snap.warnings:
            row = asdict(item)
            row["issue_level"] = item.status
            failures.append(row)

    failures_path = output_dir / f"nokia_parser_audit_{stamp}_issues.csv"
    if failures:
        import pandas as pd

        pd.DataFrame(failures).to_csv(failures_path, index=False, encoding="utf-8-sig")
    else:
        failures_path.write_text("xml_path,date_folder,status,error\n", encoding="utf-8")

    return {
        "json": json_path,
        "markdown": md_path,
        "text": txt_path,
        "pdf": pdf_path,
        "issues_csv": failures_path,
    }
