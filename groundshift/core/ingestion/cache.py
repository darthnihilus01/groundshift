from __future__ import annotations

from pathlib import Path


class TileCache:
    """Simple local cache rooted by provider scene id."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def scene_dir(self, scene_id: str) -> Path:
        safe_id = scene_id.replace("/", "_")
        path = self.root / safe_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def existing_files(self, scene_id: str) -> list[Path]:
        directory = self.scene_dir(scene_id)
        return [p for p in directory.glob("**/*") if p.is_file()]
