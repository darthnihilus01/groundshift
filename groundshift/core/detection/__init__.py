"""
Modular anomaly detection system for groundshift.

Supports multiple detection methods:
- Temporal: frame-to-frame NDVI comparison
- Spatial: regional deviation detection
- Historical: seasonal baseline comparison

Also maintains backward compatibility with raster-based detection:
- Spectral: pixel-level change detection
"""

from __future__ import annotations

# Legacy raster-based detection (backward compat)
from groundshift.core.detection.base import BaseDetector
from groundshift.core.detection.models import DetectionRequest, DetectionResult
from groundshift.core.detection.service import DetectionService
from groundshift.core.detection.spectral import SpectralDetector

# New scene-based async detection
from groundshift.core.detection.async_base import AsyncDetector
from groundshift.core.detection.async_service import AsyncDetectionService
from groundshift.core.detection.data_loader import (
    DataLoadError,
    PreprocessedDataLoader,
)
from groundshift.core.detection.models_v2 import (
    AnomalyScore,
    CompositeDetectionResult,
    DetectionInput,
    DetectionMethod,
    DetectionResult as DetectionResultV2,
)
from groundshift.core.detection.registry import DetectorRegistry
from groundshift.core.detection.temporal import TemporalDetector
from groundshift.core.detection.spatial import SpatialDetector
from groundshift.core.detection.historical import HistoricalDetector

__all__ = [
    # Legacy
    "BaseDetector",
    "DetectionRequest",
    "DetectionResult",
    "DetectionService",
    "SpectralDetector",
    # New async detection
    "AsyncDetector",
    "AsyncDetectionService",
    "AnomalyScore",
    "CompositeDetectionResult",
    "DataLoadError",
    "DetectionInput",
    "DetectionMethod",
    "DetectionResultV2",
    "DetectorRegistry",
    "HistoricalDetector",
    "PreprocessedDataLoader",
    "SpatialDetector",
    "TemporalDetector",
]
