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
            valid_pixels = np.isfinite(band)
            if not np.any(valid_pixels):
                continue

            band_min = float(np.min(band[valid_pixels]))
            band_max = float(np.max(band[valid_pixels]))
            if np.isclose(band_max, band_min):
                continue

            normalised_data[band_index, valid_pixels] = (
                band[valid_pixels] - band_min
            ) / (band_max - band_min)

        profile = src.profile.copy()
        profile.update(driver="GTiff", dtype="float32")

        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(normalised_data)

    return str(output_path)


def apply_normalisation(
    result: PreprocessingResult,
    request: PreprocessingRequest,
) -> PreprocessingResult:
    """Normalise aligned or cloud-masked scenes to per-band values in [0, 1]."""

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
