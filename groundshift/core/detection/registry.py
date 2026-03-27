"""
Detector registry and factory pattern.

Enables loose coupling and easy extension of detection methods.
"""

from __future__ import annotations

from typing import Dict, Type

from groundshift.core.detection.async_base import AsyncDetector


class DetectorRegistry:
    """
    Registry for detector lifecycle management.

    Allows registration, lookup, and instantiation of detectors by name.
    """

    _detectors: Dict[str, Type[AsyncDetector]] = {}

    @classmethod
    def register(cls, name: str, detector_class: Type[AsyncDetector]) -> None:
        """
        Register a detector class.

        Args:
            name: Detector identifier (e.g., 'temporal', 'spatial').
            detector_class: Detector class (subclass of AsyncDetector).
        """
        cls._detectors[name] = detector_class

    @classmethod
    def get(cls, name: str, config: dict) -> AsyncDetector:
        """
        Instantiate a detector by name.

        Args:
            name: Detector identifier.
            config: Detector-specific configuration.

        Returns:
            Instantiated detector.

        Raises:
            ValueError: if detector not registered.
        """
        if name not in cls._detectors:
            raise ValueError(
                f"Unknown detector: {name}. Available: {list(cls._detectors.keys())}"
            )
        return cls._detectors[name](config)

    @classmethod
    def list_available(cls) -> list[str]:
        """
        List all registered detector names.

        Returns:
            List of detector identifiers.
        """
        return list(cls._detectors.keys())


# Auto-register built-in detectors
from groundshift.core.detection.temporal import TemporalDetector
from groundshift.core.detection.spatial import SpatialDetector
from groundshift.core.detection.historical import HistoricalDetector

DetectorRegistry.register("temporal", TemporalDetector)
DetectorRegistry.register("spatial", SpatialDetector)
DetectorRegistry.register("historical", HistoricalDetector)
