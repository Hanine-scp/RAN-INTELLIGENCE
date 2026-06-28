from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from config.settings import RAW_DATA_PATH
from src.parsers.nokia_parser_audit import (
    AUDIT_CONVENTIONS,
    WARNING_LABELS,
    audit_xml_file,
    discover_corpus_files,
    expected_site_id_from_filename,
    render_summary_markdown,
    render_summary_text,
    run_corpus_audit,
    save_audit_report,
)

class TestFilenameConventions:
    def test_expected_site_id_from_mrbts_filename(self):
        assert expected_site_id_from_filename("MRBTS12012.xml") == "12012"

    def test_non_mrbts_filename_returns_none(self):
        assert expected_site_id_from_filename("other.xml") is None


class TestSingleFileAudit:
    def test_fixture_audit_has_site_and_equipment(self, equipment_fixture_path: Path):
        result = audit_xml_file(
            equipment_fixture_path,
            date_folder="2025-06-08",
            source_root=equipment_fixture_path.parent,
        )
        assert result.parsed is True
        assert result.error is None
        assert result.site_id == "12005"
        assert result.equipment_count >= 7
        assert result.status in {"ok", "warning"}
        assert "parse_no_exception" in result.conventions_passed

    def test_fixture_records_equipment_types(self, equipment_fixture_path: Path):
        result = audit_xml_file(
            equipment_fixture_path,
            date_folder="2025-06-08",
            source_root=equipment_fixture_path.parent,
        )
        types = result.equipment_type_map()
        assert "BBMOD" in types
        assert "RETU" in types


class TestCorpusDiscovery:
    def test_discover_xml_in_date_folder(self, mini_corpus_root: Path):
        files = discover_corpus_files(mini_corpus_root)
        assert len(files) == 1
        assert files[0][0] == "2026.06.08"
        assert files[0][1].name == "MRBTS10001.xml"


class TestCorpusSummary:
    def test_summary_contains_quality_rates(self, mini_corpus_root: Path):
        summary = run_corpus_audit(mini_corpus_root, max_workers=0)
        assert summary.total_files == 1
        assert summary.parse_success_rate == 100.0
        assert summary.strict_success_rate >= 0.0
        assert summary.equipment_total >= 7
        assert len(summary.conventions) == len(AUDIT_CONVENTIONS)

    def test_text_and_markdown_renderers(self, mini_corpus_root: Path):
        summary = run_corpus_audit(mini_corpus_root, max_workers=0)
        text = render_summary_text(summary)
        md = render_summary_markdown(summary)

        assert "Parse success:" in text
        assert "Convention checks:" in text
        assert "Parse success" in md
        assert "Convention checks" in md

    def test_report_bundle_includes_pdf(self, mini_corpus_root: Path, tmp_path: Path):
        summary = run_corpus_audit(mini_corpus_root, max_workers=0)
        paths = save_audit_report(summary, tmp_path / "reports", prefix="test")

        assert paths["json"].exists()
        assert paths["pdf"].exists()
        assert paths["pdf"].read_bytes()[:4] == b"%PDF"
        assert paths["pdf"].stat().st_size > 2_000

        payload = json.loads(paths["json"].read_text(encoding="utf-8"))
        assert payload["total_files"] == 1
        assert "parse_success_rate" not in payload  # property, not serialized
        assert payload["parsed_count"] == 1
        assert payload["conventions"]


class TestWarningCatalog:
    @pytest.mark.parametrize(
        "code",
        ["missing_site", "zero_equipment", "zero_cells", "site_id_mismatch"],
    )
    def test_warning_labels_exist(self, code: str):
        assert code in WARNING_LABELS
        assert WARNING_LABELS[code]


@pytest.mark.integration
@pytest.mark.skipif(not RAW_DATA_PATH.exists(), reason="DATA.XML not available")
class TestRealDataXmlSample:
    def test_sample_files_parse_without_error(self):
        files = discover_corpus_files(RAW_DATA_PATH, limit=3)
        for date_folder, xml_path in files:
            result = audit_xml_file(
                xml_path,
                date_folder=date_folder,
                source_root=RAW_DATA_PATH,
            )
            assert result.parsed is True
            assert result.status in {"ok", "warning"}, result


@pytest.mark.corpus
@pytest.mark.integration
@pytest.mark.skipif(not RAW_DATA_PATH.exists(), reason="DATA.XML not available")
@pytest.mark.skipif(os.getenv("NOKIA_CORPUS_AUDIT") != "1", reason="Set NOKIA_CORPUS_AUDIT=1")
class TestFullCorpusAudit:
    def test_all_nokia_xml_files_parse_without_exception(self):
        summary = run_corpus_audit(RAW_DATA_PATH, max_workers=0)
        assert summary.parse_success_rate == 100.0
        assert summary.error_count == 0, [
            (item.xml_path, item.error or item.warnings) for item in summary.error_samples
        ]
