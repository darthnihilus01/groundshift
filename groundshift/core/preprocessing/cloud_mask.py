from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Protocol

import numpy as np
import rasterio

from groundshift.core.preprocessing.models import PreprocessingRequest, PreprocessingResult


class CloudDetector(Protocol):
    def get_cloud_probability_maps(self, data: np.ndarray) -> np.ndarray:
        """Return cloud probabilities in [0, 1] for each pixel."""


def _build_cloud_detector() -> CloudDetector:
    try:
        from s2cloudless import S2PixelCloudDetector
    except ImportError as exc:
        raise ImportError(
            "s2cloudless is required for cloud masking. Install preprocessing extras."
        ) from exc

    return S2PixelCloudDetector(threshold=0.4)


def _read_probability_map(detector: CloudDetector, scene_data: np.ndarray) -> np.ndarray:
    model_input = scene_data.astype(np.float32, copy=False)
    if np.nanmax(model_input) > 1.0:
        model_input = np.clip(model_input / 10000.0, 0.0, 1.0)

    # s2cloudless expects a batch axis and fixed Sentinel-2 band order.
    probability = detector.get_cloud_probability_maps(model_input[np.newaxis, ...])
    if probability.ndim == 3:
        return probability[0]
    return probability


def _mask_scene(
    *,
    detector: CloudDetector,
    scene_path: str,
    output_dir: Path,
    output_prefix: str,
    threshold: float,
) -> tuple[str, str]:
    with rasterio.open(scene_path) as src:
        if src.count != 12:
            raise ValueError(
                f"{output_prefix} scene must contain exactly 12 bands in Sentinel-2 order; found {src.count}"
            )

        scene_data = src.read()
        probability = _read_probability_map(detector, scene_data)
        cloud_mask = (probability >= threshold).astype(np.uint8)

        masked_data = scene_data.copy()
        masked_data[:, cloud_mask == 1] = 0

        masked_profile = src.profile.copy()
        masked_profile.update(driver="GTiff")

        mask_profile = src.profile.copy()
        mask_profile.update(driver="GTiff", count=1, dtype="uint8")

        masked_path = output_dir / f"{output_prefix}_masked.tif"
        cloud_mask_path = output_dir / f"{output_prefix}_cloud_mask.tif"

        with rasterio.open(masked_path, "w", **masked_profile) as dst_masked:
            dst_masked.write(masked_data)

        with rasterio.open(cloud_mask_path, "w", **mask_profile) as dst_cloud_mask:
            dst_cloud_mask.write(cloud_mask, 1)

    return str(masked_path), str(cloud_mask_path)


def apply_cloud_mask(
    result: PreprocessingResult,
    request: PreprocessingRequest,
) -> PreprocessingResult:
    """Apply s2cloudless cloud masking to co-registered reference and target scenes."""

    if not result.reference_aligned_path or not result.target_aligned_path:
        raise ValueError("Cloud masking requires co-registered reference and target scene paths")

    threshold = request.cloud_cover_threshold
    if threshold < 0.0 or threshold > 1.0:
        raise ValueError("cloud_cover_threshold must be between 0 and 1")

    output_dir = Path(request.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    detector = _build_cloud_detector()

    reference_masked_path, reference_cloud_mask_path = _mask_scene(
        detector=detector,
        scene_path=result.reference_aligned_path,
        output_dir=output_dir,
        output_prefix="reference",
        threshold=threshold,
    )
    target_masked_path, target_cloud_mask_path = _mask_scene(
        detector=detector,
        scene_path=result.target_aligned_path,
        output_dir=output_dir,
        output_prefix="target",
        threshold=threshold,
    )

    return replace(
        result,
        reference_masked_path=reference_masked_path,
        target_masked_path=target_masked_path,
        reference_cloud_mask_path=reference_cloud_mask_path,
        target_cloud_mask_path=target_cloud_mask_path,
    )
