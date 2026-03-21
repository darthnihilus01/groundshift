from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AlertRequest:
    change_score_path: str
    threshold: float
    aoi_wkt: str
    scene_date: str
    output_dir: str
    webhook_url: str | None = None


@dataclass(frozen=True, slots=True)
class AlertResult:
    geojson_path: str
    alert_fired: bool
    mean_change_score: float
    changed_area_fraction: float
    scene_date: str
    aoi_wkt: str
