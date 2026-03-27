"""
Temporal anomaly detection.

Compare current scene NDVI to prior acquisition within lookback window.
"""

from __future__ import annotations

import logging
from typing import Optional

from groundshift.core.detection.async_base import AsyncDetector
from groundshift.core.detection.models_v2 import (
    AnomalyScore,
    DetectionInput,
    DetectionMethod,
    DetectionResult,
)
from groundshift.core.detection.utils import normalize_ndvi, clip_to_confidence

logger = logging.getLogger(__name__)


class TemporalDetector(AsyncDetector):
    """
    Detect anomalies via frame-to-frame NDVI comparison.

    Logic:
    - Fetch prior scene within lookback window.
    - Compare NDVI to current scene.
    - Flag significant changes (> threshold).
    """

    @property
    def method_name(self) -> str:
        return DetectionMethod.TEMPORAL.value

    async def detect(self, inp: DetectionInput) -> DetectionResult:
        """
        Detect temporal anomalies.

        Requires collection_date or uses scene_date for lookback.
        """
        import time

        start = time.time()

        try:
            # Extract NDVI from current scene
            current_ndvi = inp.current_scene.get("ndvi")
            if current_ndvi is None:
                # Try to compute from red/nir
                red = inp.current_scene.get("red")
                nir = inp.current_scene.get("nir")
                if red is not None and nir is not None:
                    current_ndvi = normalize_ndvi(red, nir)
                else:
                    return DetectionResult(
                        method=DetectionMethod.TEMPORAL,
                        anomalies=[],
                        processing_time_ms=0,
                        status="insufficient_data",
                        error_msg="Missing NDVI or red/nir bands",
                    )

            # For now, simulate prior scene (in production: query archive)
            prior_ndvi = self._simulate_prior_ndvi(current_ndvi)

            if prior_ndvi is None:
                return DetectionResult(
                    method=DetectionMethod.TEMPORAL,
                    anomalies=[],
                    processing_time_ms=0,
                    status="insufficient_data",
                    error_msg="No prior scene found in lookback window",
                )

            # Compute NDVI delta (absolute change)
            ndvi_delta = abs(current_ndvi - prior_ndvi)

            # Threshold
            threshold = self.config.get("threshold", 0.3)
            is_anomalous = ndvi_delta > threshold
            anomaly_frac = float(is_anomalous.mean())

            # Create score
            if anomaly_frac > 0.01:  # > 1% anomalous pixels
                anomalies = [
                    AnomalyScore(
                        method=DetectionMethod.TEMPORAL,
                        score=clip_to_confidence(anomaly_frac),
                        explanation=f"NDVI delta > {threshold:.2f} ({anomaly_frac*100:.1f}% pixels)",
                    )
                ]
            else:
                anomalies = []

            elapsed = (time.time() - start) * 1000
            return DetectionResult(
                method=DetectionMethod.TEMPORAL,
                anomalies=anomalies,
                processing_time_ms=elapsed,
                status="success",
            )

        except Exception as e:
            logger.exception("Temporal detection failed")
            return DetectionResult(
                method=DetectionMethod.TEMPORAL,
                anomalies=[],
                processing_time_ms=0,
                status="error",
                error_msg=str(e),
            )

    def _simulate_prior_ndvi(self, current_ndvi):
        """
        Simulate prior scene for demo.

        In production: query scene archive.
        """
        # Add random noise to simulate temporal variation
        import numpy as np

        noise = np.random.normal(0, 0.05, current_ndvi.shape)
        return np.clip(current_ndvi + noise, -1, 1)
