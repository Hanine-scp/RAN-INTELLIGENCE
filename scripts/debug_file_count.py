import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(PROJECT_ROOT))

from config.settings import RAW_DATA_PATH


def debug_folder(folder_name: str):
    folder = RAW_DATA_PATH / folder_name

    files_all = [p for p in folder.iterdir() if p.is_file()]
    xml_files = [p for p in files_all if p.suffix.lower() == ".xml"]

    print("Folder:", folder)
    print("All files:", len(files_all))
    print("XML files:", len(xml_files))

    print("\nExtensions trouvées:")
    extensions = {}
    for p in files_all:
        ext = p.suffix.lower() if p.suffix else "NO_EXTENSION"
        extensions[ext] = extensions.get(ext, 0) + 1

    for ext, count in sorted(extensions.items()):
        print(ext, count)

    print("\n10 premiers fichiers:")
    for p in sorted(files_all)[:10]:
        print("-", p.name)

    print("\n10 derniers fichiers:")
    for p in sorted(files_all)[-10:]:
        print("-", p.name)


if __name__ == "__main__":
    debug_folder("2025.09.11")