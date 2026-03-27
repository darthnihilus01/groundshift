"""
Historical anomaly detection.

Compare current scene to multi-year seasonal baseline.
"""

from __future__ import annotations

import logging
from datetime import datetime

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


class HistoricalDetector(AsyncDetector):
    """
    Detect historical anomalies via seasonal baseline comparison.

    Logic:
    - Extract season (month) from scene date.
    - Fetch historical mean/std for AOI+season.
    - Compute z-score relative to baseline.
    - Flag if deviation exceeds threshold.
    """

    @property
    def method_name(self) -> str:
        return DetectionMethod.HISTORICAL.value

    async def detect(self, inp: DetectionInput) -> DetectionResult:
        """
        Detect anomalies relative to historical baseline.
        """
        import time

        start = time.time()

        try:
            current_ndvi = inp.current_scene.get("ndvi")
            if current_ndvi is None:
                return DetectionResult(
                    method=DetectionMethod.HISTORICAL,
                    anomalies=[],
                    processing_time_ms=0,
                    status="insufficient_data",
                    error_msg="Missing NDVI",
                )

            # Compute current scene NDVI statistic
            valid_mask = np.isfinite(current_ndvi)
            if not np.any(valid_mask):
                return DetectionResult(
                    method=DetectionMethod.HISTORICAL,
                    anomalies=[],
                    processing_time_ms=0,
                    status="insufficient_data",
                    error_msg="No valid pixels in scene",
                )

            scene_ndvi = float(np.mean(current_ndvi[valid_mask]))

            # Fetch seasonal baseline (in production: query data warehouse)
            season = self._extract_season(inp.scene_date)
            baseline = self._simulate_seasonal_baseline(season)

            if baseline is None:
                return DetectionResult(
                    method=DetectionMethod.HISTORICAL,
                    anomalies=[],
                    processing_time_ms=0,
                    status="insufficient_data",
                    error_msg=f"No baseline for season {season}",
                )

            baseline_mean = baseline["mean"]
            baseline_std = baseline["std"]

            # Compute z-score
            z_seasonal = z_score(scene_ndvi, baseline_mean, baseline_std)

            # Threshold
            threshold = self.config.get("threshold", 2.0)

            if abs(z_seasonal) > threshold:
                conf = confidence_from_zscore(z_seasonal, threshold)
                anomalies = [
                    AnomalyScore(
                        method=DetectionMethod.HISTORICAL,
                        score=conf,
                        explanation=f"Seasonal anomaly: {z_seasonal:.2f}σ (baseline={baseline_mean:.3f})",
                    )
                ]
            else:
                anomalies = []

            elapsed = (time.time() - start) * 1000
            return DetectionResult(
                method=DetectionMethod.HISTORICAL,
                anomalies=anomalies,
                processing_time_ms=elapsed,
                status="success",
            )

        except Exception as e:
            logger.exception("Historical detection failed")
            return DetectionResult(
                method=DetectionMethod.HISTORICAL,
                anomalies=[],
                processing_time_ms=0,
                status="error",
                error_msg=str(e),
            )

    def _extract_season(self, date_str: str) -> int:
        """
        Extract season (month 1-12) from ISO date string.

        Args:
            date_str: ISO 8601 date string.

        Returns:
            Month (1-12).
        """
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            return dt.month
        except Exception:
            return datetime.utcnow().month

    def _simulate_seasonal_baseline(self, season: int):
        """
        Simulate seasonal baseline statistics.

        In production: query data warehouse for historical NDVI distribution.
        """
        # Simulate baseline that varies by season
        base_ndvi = 0.5 + 0.15 * np.sin(2 * np.pi * season / 12)
        std_ndvi = 0.1

        return {
            "mean": base_ndvi,
            "std": std_ndvi,
            "season": season,
            "years": 5,
        }
