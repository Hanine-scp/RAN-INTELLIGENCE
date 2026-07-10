from pathlib import Path

from config import settings


def test_default_xml_root_points_to_workspace_data_xml_folder() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    expected = repo_root / "DATA.XML"

    assert settings.RAW_DATA_PATH == expected
