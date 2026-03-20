from __future__ import annotations
import logging
from dataclasses import replace
from pathlib import Path

import numpy as np
import rasterio

from groundshift.core.detection.models import DetectionRequest, DetectionResult
from groundshift.core.detection.spectral import SpectralDetector

logger = logging.getLogger(__name__)


class DetectionService:
    DETECTORS = {
        "spectral": SpectralDetector,
    }

    def run(self, request: DetectionRequest) -> DetectionResult:
        # validate detector name
        if request.detector_name not in self.DETECTORS:
            raise ValueError(
                f"Unknown detector '{request.detector_name}'. "
                f"Available: {list(self.DETECTORS.keys())}"
            )

        # instantiate detector
        detector = self.DETECTORS[request.detector_name]()

        # read both scenes
        with rasterio.open(request.reference_path) as ref_ds:
            reference_data = ref_ds.read().astype(np.float32)
            ref_profile = ref_ds.profile.copy()
            crs_wkt = ref_ds.crs.to_wkt()
            transform_gdal = tuple(ref_ds.transform.to_gdal())

        with rasterio.open(request.target_path) as tgt_ds:
            target_data = tgt_ds.read().astype(np.float32)

        # validate shapes match
        if reference_data.shape != target_data.shape:
            raise ValueError(
                f"Scene shape mismatch: reference {reference_data.shape} "
                f"vs target {target_data.shape}"
            )

        # run detection
        logger.info("Running detector: %s", request.detector_name)
        change_scores = detector.detect(reference_data, target_data)

        # compute statistics on non-cloud pixels only
        valid_mask = change_scores != 0
        if not np.any(valid_mask):
            mean_change_score = 0.0
            changed_area_fraction = 0.0
        else:
            mean_change_score = float(np.mean(change_scores[valid_mask]))
            changed_area_fraction = float(
                np.sum(change_scores > request.threshold) / np.sum(valid_mask)
            )

        # write change score GeoTIFF
        output_dir = Path(request.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        change_score_path = output_dir / "change_scores.tif"

        out_profile = ref_profile.copy()
        out_profile.update(driver="GTiff", count=1, dtype="float32")

        with rasterio.open(change_score_path, "w", **out_profile) as dst:
            dst.write(change_scores[np.newaxis, ...])

        logger.info(
            "Detection complete — mean score: %.3f, changed area: %.1f%%",
            mean_change_score,
            changed_area_fraction * 100,
        )

        return DetectionResult(
            change_score_path=str(change_score_path),
            mean_change_score=mean_change_score,
            changed_area_fraction=changed_area_fraction,
            threshold=request.threshold,
            crs_wkt=crs_wkt,
            transform_gdal=transform_gdal,
        )
