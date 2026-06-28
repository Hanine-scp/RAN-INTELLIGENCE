from __future__ import annotations

from pathlib import Path

import pytest

from config.settings import RAW_DATA_PATH

BACKEND_FIXTURES = Path(__file__).resolve().parent / "fixtures"
EQUIPMENT_FIXTURE_XML = BACKEND_FIXTURES / "equipment_seven_types_sample.xml"
REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture
def equipment_fixture_path() -> Path:
    return EQUIPMENT_FIXTURE_XML


@pytest.fixture
def backend_fixtures_dir() -> Path:
    return BACKEND_FIXTURES


@pytest.fixture
def mini_corpus_root(tmp_path: Path, equipment_fixture_path: Path) -> Path:
    snap = tmp_path / "2026.06.08"
    snap.mkdir()
    (snap / "MRBTS10001.xml").write_text(
        equipment_fixture_path.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    return tmp_path


@pytest.fixture
def data_xml_available() -> bool:
    return RAW_DATA_PATH.exists()
