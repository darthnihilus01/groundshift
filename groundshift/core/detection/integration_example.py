"""
Integration example: Async detection in FastAPI routes.

Shows how to use the modular detection system in the groundshift API.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from groundshift.core.detection import (
    AsyncDetectionService,
    CompositeDetectionResult,
    DetectionInput,
)

# Create router for detection endpoints
router = APIRouter(prefix="/api/detection", tags=["detection"])

# Initialize service once at app startup (in real app, use @app.on_event("startup"))
DETECTION_SERVICE = AsyncDetectionService(
    detector_configs={
        "temporal": {
            "threshold": 0.3,
            "lookback_days": 30,
        },
        "spatial": {
            "threshold": 2.0,
            "buffer_km": 50,
        },
        "historical": {
            "threshold": 2.0,
            "baseline_years": 5,
        },
    },
    aggregation_mode="max",
    composite_threshold=0.5,
)


class ScenePayload(BaseModel):
    """Scene data for detection."""

    aoi_wkt: str
    scene_date: str
    ndvi: list[list[float]]  # 2D array
    red: list[list[float]] | None = None
    nir: list[list[float]] | None = None
    metadata: dict | None = None


class DetectionResponse(BaseModel):
    """Detection result response."""

    watch_id: str
    composite_score: float
    is_anomaly: bool
    contributing_methods: list[str]
    details: dict


@router.post("/run")
async def run_detection_pipeline(
    watch_id: str,
    payload: ScenePayload,
) -> DetectionResponse:
    """
    Run full anomaly detection pipeline for a watch area.

    Executes all configured detectors in parallel and returns aggregated result.

    Args:
        watch_id: Identifier of the monitored watch area.
        payload: Scene data with NDVI and metadata.

    Returns:
        CompositeDetectionResult with composite score and contributing methods.

    Raises:
        HTTPException: on processing errors.
    """
    try:
        # Build unified detection input
        import numpy as np

        inp = DetectionInput(
            aoi_wkt=payload.aoi_wkt,
            scene_date=payload.scene_date,
            current_scene={
                "ndvi": np.array(payload.ndvi, dtype=np.float32),
                "red": np.array(payload.red) if payload.red else None,
                "nir": np.array(payload.nir) if payload.nir else None,
            },
            metadata={"watch_id": watch_id, **(payload.metadata or {})},
        )

        # Run all detectors in parallel
        results = await DETECTION_SERVICE.run_detection(inp)

        # Aggregate into composite alert
        composite = DETECTION_SERVICE.aggregate_results(results)

        # Log alert if anomalous
        if composite.is_anomaly:
            print(
                f"[ALERT] Watch {watch_id}: anomaly detected (score={composite.composite_score:.3f})"
            )
            # In production: insert into alert DB, publish to topic, etc.

        return DetectionResponse(
            watch_id=watch_id,
            composite_score=composite.composite_score,
            is_anomaly=composite.is_anomaly,
            contributing_methods=composite.contributing_methods,
            details={
                name: {
                    "status": result.status,
                    "anomalies": len(result.anomalies),
                    "processing_time_ms": result.processing_time_ms,
                    "error": result.error_msg,
                }
                for name, result in composite.details.items()
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@router.get("/detectors")
def list_available_detectors() -> dict:
    """
    List all available detection methods.

    Returns:
        Dict with detector names and their purposes.
    """
    from groundshift.core.detection import DetectorRegistry

    detectors = DetectorRegistry.list_available()
    descriptions = {
        "temporal": "Frame-to-frame NDVI change detection",
        "spatial": "Regional deviation from neighbors",
        "historical": "Seasonal baseline anomaly detection",
    }

    return {
        "available": detectors,
        "descriptions": {d: descriptions.get(d, "") for d in detectors},
    }


@router.post("/run/selective")
async def run_selective_detection(
    watch_id: str,
    payload: ScenePayload,
    methods: list[str] | None = None,
) -> DetectionResponse:
    """
    Run specific detection methods (subset of full pipeline).

    Useful for targeted analysis or debugging.

    Args:
        watch_id: Watch area identifier.
        payload: Scene data.
        methods: Which detectors to run (e.g., ["temporal", "spatial"]).

    Returns:
        DetectionResponse.
    """
    try:
        import numpy as np

        inp = DetectionInput(
            aoi_wkt=payload.aoi_wkt,
            scene_date=payload.scene_date,
            current_scene={
                "ndvi": np.array(payload.ndvi, dtype=np.float32),
                "red": np.array(payload.red) if payload.red else None,
                "nir": np.array(payload.nir) if payload.nir else None,
            },
            metadata={"watch_id": watch_id},
        )

        # Run subset of detectors
        results = await DETECTION_SERVICE.run_detection(inp, methods=methods)
        composite = DETECTION_SERVICE.aggregate_results(results)

        return DetectionResponse(
            watch_id=watch_id,
            composite_score=composite.composite_score,
            is_anomaly=composite.is_anomaly,
            contributing_methods=composite.contributing_methods,
            details={
                name: {
                    "status": result.status,
                    "anomalies": len(result.anomalies),
                }
                for name, result in composite.details.items()
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
