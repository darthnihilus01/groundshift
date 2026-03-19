from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime


@dataclass(slots=True)
class SceneSummary:
    """Metadata we need from a catalog hit before download."""

    scene_id: str
    title: str
    acquired_at: datetime
    cloud_cover: float
    footprint_wkt: str | None = None
    relative_orbit: int | None = None
    tile_id: str | None = None
    product_type: str = "S2MSI2A"
    platform_name: str = "Sentinel-2"


@dataclass(slots=True)
class DownloadedScene:
    """A downloaded product path and its scene metadata."""

    scene: SceneSummary
    local_path: str


@dataclass(slots=True)
class IngestionRequest:
    """Inputs required for one ingestion run."""

    aoi_wkt: str
    start_date: date
    end_date: date
    max_cloud_cover: float = 20.0
    limit: int = 20


@dataclass(slots=True)
class IngestionResult:
    """Structured output for downstream preprocessing and scheduling."""

    requested: IngestionRequest
    matched_scenes: list[SceneSummary]
    downloaded_scenes: list[DownloadedScene]
