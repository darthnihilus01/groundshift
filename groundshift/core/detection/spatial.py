"""
Spatial anomaly detection.

Compare AOI to neighboring regions for deviation detection.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from groundshift.core.detection.async_base import AsyncDetector
from groundshift.core.detection.models_v2 import (
    AnomalyScore,
    DetectionInput,
    DetectionMethod,
    DetectionResult,
)
from groundshift.core.detection.utils import z_score, confidence_from_zscore

logger = logging.getLogger(__name__)


class SpatialDetector(AsyncDetector):
    """
    Detect spatial anomalies via regional comparison.

    Logic:
    - Compute mean NDVI for AOI.
    - Fetch mean NDVI for surrounding regions.
    - Compute z-score (deviation in stds).
    - Flag if z > threshold.
    """

    @property
    def method_name(self) -> str:
        return DetectionMethod.SPATIAL.value

    async def detect(self, inp: DetectionInput) -> DetectionResult:
        """
        Detect spatial anomalies via regional deviation.
        """
        import time

        start = time.time()

        try:
            current_ndvi = inp.current_scene.get("ndvi")
            if current_ndvi is None:
                return DetectionResult(
                    method=DetectionMethod.SPATIAL,
                    anomalies=[],
                    processing_time_ms=0,
                    status="insufficient_data",
                    error_msg="Missing NDVI",
                )

            # Compute AOI statistic (mean NDVI of valid pixels)
            valid_mask = np.isfinite(current_ndvi)
            if not np.any(valid_mask):
                return DetectionResult(
                    method=DetectionMethod.SPATIAL,
                    anomalies=[],
                    processing_time_ms=0,
                    status="insufficient_data",
                    error_msg="No valid pixels in AOI",
                )

            aoi_mean = float(np.mean(current_ndvi[valid_mask]))

            # Simulate neighbor statistics (in production: query spatial index)
            neighbors = self._simulate_neighbor_stats()

            neighbor_means = neighbors["means"]
            neighbor_std = float(np.std(neighbor_means))

            if neighbor_std < 1e-6:
                z_dev = 0.0
            else:
                neighbor_mean = float(np.mean(neighbor_means))
                z_dev = z_score(aoi_mean, neighbor_mean, neighbor_std)

            # Threshold
            threshold = self.config.get("threshold", 2.0)

            if abs(z_dev) > threshold:
                conf = confidence_from_zscore(z_dev, threshold)
                anomalies = [
                    AnomalyScore(
                        method=DetectionMethod.SPATIAL,
                        score=conf,
                        explanation=f"Regional deviation: {z_dev:.2f}σ (AOI={aoi_mean:.3f})",
                    )
                ]
            else:
                anomalies = []

            elapsed = (time.time() - start) * 1000
            return DetectionResult(
                method=DetectionMethod.SPATIAL,
                anomalies=anomalies,
                processing_time_ms=elapsed,
                status="success",
            )

        except Exception as e:
            logger.exception("Spatial detection failed")
            return DetectionResult(
                method=DetectionMethod.SPATIAL,
                anomalies=[],
                processing_time_ms=0,
                status="error",
                error_msg=str(e),
            )

    def _simulate_neighbor_stats(self):
        """
        Simulate neighbor region statistics.

        In production: query spatial index (e.g., PostGIS).
        """
        # Generate random neighbor means from normal distribution
        means = np.random.normal(0.6, 0.1, 10)
        return {"means": means}
