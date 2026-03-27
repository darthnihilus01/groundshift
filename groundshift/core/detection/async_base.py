"""
Abstract base class for async anomaly detectors.

All new detection methods inherit from this.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from groundshift.core.detection.models_v2 import DetectionInput, DetectionResult


class AsyncDetector(ABC):
    """
    Abstract detector for scene-level anomaly detection.

    Detectors run asynchronously and can fetch external data
    (prior scenes, baselines, neighbors).
    """

    def __init__(self, config: dict):
        """
        Args:
            config: detector-specific settings (thresholds, windows, etc.)
        """
        self.config = config

    @abstractmethod
    async def detect(self, inp: DetectionInput) -> DetectionResult:
        """
        Detect anomalies in input scene.

        Args:
            inp: Unified detection input.

        Returns:
            DetectionResult with list of anomalies.

        Raises:
            Exception: on processing failure (caught by orchestrator).
        """
        pass

    @property
    @abstractmethod
    def method_name(self) -> str:
        """Return the detection method name."""
        pass
