from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import numpy as np
import rasterio

from groundshift.core.preprocessing.models import PreprocessingRequest, PreprocessingResult


def _normalise_scene(*, scene_path: str, output_path: Path) -> str:
    with rasterio.open(scene_path) as src:
        scene_data = src.read().astype(np.float32, copy=False)
        normalised_data = np.zeros_like(scene_data, dtype=np.float32)

        for band_index in range(scene_data.shape[0]):
            band = scene_data[band_index]
            non_cloud_pixels = band != 0
            if not np.any(non_cloud_pixels):
                continue

            mean = float(np.mean(band[non_cloud_pixels]))
            std = float(np.std(band[non_cloud_pixels]))
            if std < 1e-6:
                continue

            normalised_data[band_index, non_cloud_pixels] = np.clip(
                (band[non_cloud_pixels] - mean) / std,
                -3.0,
                3.0,
            )

        profile = src.profile.copy()
        profile.update(driver="GTiff", dtype="float32")

        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(normalised_data)

    return str(output_path)


def apply_normalisation(
    result: PreprocessingResult,
    request: PreprocessingRequest,
) -> PreprocessingResult:
    """Apply cloud-aware per-band Z-score normalisation clipped to [-3, 3]."""

    reference_source = result.reference_masked_path or result.reference_aligned_path
    target_source = result.target_masked_path or result.target_aligned_path

    output_dir = Path(request.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    reference_normalized_path = _normalise_scene(
        scene_path=reference_source,
        output_path=output_dir / "reference_normalized.tif",
    )
    target_normalized_path = _normalise_scene(
        scene_path=target_source,
        output_path=output_dir / "target_normalized.tif",
    )

    return replace(
        result,
        reference_normalized_path=reference_normalized_path,
        target_normalized_path=target_normalized_path,
    )
    