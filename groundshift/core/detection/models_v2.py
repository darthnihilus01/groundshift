"""
Enhanced data models for modular anomaly detection.

These complement the existing DetectionRequest/DetectionResult for raster-based
detection and add support for higher-level scene anomaly detection.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional


class DetectionMethod(str, Enum):
    """Anomaly detection method identifier."""

    TEMPORAL = "temporal"
    SPATIAL = "spatial"
    HISTORICAL = "historical"
    SPECTRAL = "spectral"  # backward compat


@dataclass
class DetectionInput:
    """
    Unified input schema for all anomaly detectors.

    Represents a single scene and its context for detection inference.
    """

    aoi_wkt: str
    """Area of interest as WKT polygon (EPSG:4326)."""

    scene_date: str
    """ISO 8601 timestamp of scene acquisition."""

    current_scene: dict[str, Any]
    """Scene data: NDVI, red, nir, cloud_mask, etc."""

    collection_date: Optional[str] = None
    """Optional: date for multi-temporal comparisons."""

    metadata: Optional[dict[str, Any]] = None
    """Optional: extra context (watch_id, region, etc.)."""


@dataclass
class AnomalyScore:
    """Per-feature anomaly detection result."""

    method: DetectionMethod
    """Which detector produced this score."""

    score: float
    """Confidence [0, 1]."""

    spatial_extents: Optional[dict[str, Any]] = None
    """Optional: bounding box, polygon, or pixel indices."""

    explanation: Optional[str] = None
    """Optional: human-readable reason for flagging."""


@dataclass
class DetectionResult:
    """Output from a single detector."""

    method: DetectionMethod
    """Which detection method was used."""

    anomalies: list[AnomalyScore] = field(default_factory=list)
    """List of detected anomalies."""

    processing_time_ms: float = 0.0
    """Time taken to run detection."""

    status: str = "success"
    """'success', 'insufficient_data', 'error'."""

    error_msg: Optional[str] = None
    """Error details if status == 'error'."""


@dataclass
class CompositeDetectionResult:
    """Aggregated results from multiple detectors."""

    composite_score: float
    """Aggregated anomaly score [0, 1]."""

    is_anomaly: bool
    """Whether composite score exceeds threshold."""

    contributing_methods: list[str]
    """Which detectors found anomalies."""

    details: dict[str, DetectionResult]
    """Per-detector breakdown."""

    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    """Result generation time."""
