from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class DetectionRequest:
    reference_path: str
    target_path: str
    output_dir: str
    threshold: float = 0.2
    detector_name: str = "spectral"


@dataclass(frozen=True, slots=True)
class DetectionResult:
    change_score_path: str
    mean_change_score: float
    changed_area_fraction: float
    threshold: float
    crs_wkt: str
    transform_gdal: tuple[float, float, float, float, float, float]
