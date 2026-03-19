from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class PreprocessingRequest:
    """Inputs for preprocessing a reference/target scene pair."""

    reference_scene_path: str
    target_scene_path: str
    output_dir: str


@dataclass(slots=True)
class PreprocessingResult:
    """Outputs produced by the preprocessing workflow."""

    reference_aligned_path: str
    target_aligned_path: str
    reference_masked_path: str | None = None
    target_masked_path: str | None = None
    reference_normalized_path: str | None = None
    target_normalized_path: str | None = None
    reference_cloud_mask_path: str | None = None
    target_cloud_mask_path: str | None = None
    crs_wkt: str | None = None
    transform_gdal: tuple[float, float, float, float, float, float] | None = None
