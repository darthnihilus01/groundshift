"""
Asynchronous detection orchestration service.

Coordinates multiple detectors, aggregates results, and produces composite alerts.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Dict, Optional

from groundshift.core.detection.models_v2 import (
    CompositeDetectionResult,
    DetectionInput,
    DetectionResult,
)
from groundshift.core.detection.registry import DetectorRegistry

logger = logging.getLogger(__name__)


class AsyncDetectionService:
    """
    Orchestrate multiple anomaly detectors.

    Responsibility:
    - Run configured detectors in parallel.
    - Aggregate scores.
    - Apply thresholds.
    - Return composite result.
    """

    def __init__(
        self,
        detector_configs: Dict[str, dict],
        aggregation_mode: str = "max",
        composite_threshold: float = 0.5,
    ):
        """
        Initialize detection service.

        Args:
            detector_configs: Dict of {detector_name: config_dict}.
                Example: {
                    "temporal": {"threshold": 0.3, "lookback_days": 30},
                    "spatial": {"threshold": 2.0, "buffer_km": 50},
                    "historical": {"threshold": 2.0, "baseline_years": 5}
                }
            aggregation_mode: How to combine scores ("max", "mean", "voting").
            composite_threshold: Score above which to flag as anomaly.
        """
        self.detectors: Dict[str, any] = {}
        for name, config in detector_configs.items():
            self.detectors[name] = DetectorRegistry.get(name, config)

        self.aggregation_mode = aggregation_mode
        self.composite_threshold = composite_threshold

    async def run_detection(
        self,
        inp: DetectionInput,
        methods: Optional[list[str]] = None,
    ) -> Dict[str, DetectionResult]:
        """
        Run all or specified detectors in parallel.

        Args:
            inp: Detection input.
            methods: Which detectors to run (default: all).

        Returns:
            Dict mapping detector_name -> DetectionResult.
        """
        methods = methods or list(self.detectors.keys())

        # Build tasks
        tasks = [
            self._run_detector_safe(name, self.detectors[name], inp)
            for name in methods
            if name in self.detectors
        ]

        # Run in parallel
        results = await asyncio.gather(*tasks)

        return {m: r for m, r in zip(methods, results)}

    async def _run_detector_safe(self, name: str, detector, inp: DetectionInput):
        """Run detector with exception handling."""
        try:
            result = await detector.detect(inp)
            logger.debug(
                "Detector %s completed: status=%s, anomalies=%d",
                name,
                result.status,
                len(result.anomalies),
            )
            return result
        except Exception as e:
            logger.exception("Detector %s failed", name)
            return DetectionResult(
                method=detector.method_name,
                anomalies=[],
                processing_time_ms=0,
                status="error",
                error_msg=str(e),
            )

    def aggregate_results(
        self,
        results: Dict[str, DetectionResult],
    ) -> CompositeDetectionResult:
        """
        Combine detector results into composite alert.

        Args:
            results: Dict mapping detector_name -> DetectionResult.

        Returns:
            CompositeDetectionResult with aggregated score and metadata.
        """
        all_scores = []
        contributing = []

        for name, result in results.items():
            if result.status == "success" and result.anomalies:
                score = max(a.score for a in result.anomalies)
                all_scores.append(score)
                contributing.append(name)

        # Aggregate based on mode
        if not all_scores:
            composite = 0.0
        elif self.aggregation_mode == "max":
            composite = max(all_scores)
        elif self.aggregation_mode == "mean":
            composite = sum(all_scores) / len(all_scores)
        else:  # voting: require 2+ detectors
            composite = 1.0 if len(all_scores) >= 2 else all_scores[0]

        is_anomaly = composite >= self.composite_threshold

        return CompositeDetectionResult(
            composite_score=composite,
            is_anomaly=is_anomaly,
            contributing_methods=contributing,
            details=results,
        )
