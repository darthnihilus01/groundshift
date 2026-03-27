"""
Integration Guide: Detection Routes in FastAPI

This document shows how to properly integrate the modular detection system
into the groundshift FastAPI API layer.
"""

# ============================================================================
# FILE: groundshift/api/routes/detections.py (NEW)
# ============================================================================

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
from fastapi import APIRouter, HTTPException, Query

from groundshift.core.detection import (
    AsyncDetectionService,
    DataLoadError,
    PreprocessedDataLoader,
)
from groundshift.core.preprocessing.models import PreprocessingResult
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/detections", tags=["detections"])

# ============================================================================
# SERVICE INITIALIZATION (happens once at app startup)
# ============================================================================

DETECTION_SERVICE: Optional[AsyncDetectionService] = None


def initialize_detection_service():
    """
    Initialize the detection service with default configurations.
    
    Called from: groundshift/api/main.py in startup event.
    """
    global DETECTION_SERVICE
    
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
    logger.info("Detection service initialized with 3 detectors (temporal, spatial, historical)")


# ============================================================================
# PYDANTIC MODELS (for HTTP requests/responses)
# ============================================================================

class PreprocessingResultRequest(BaseModel):
    """Reference to preprocessing output files."""
    
    target_normalized_path: str = Field(
        ..., description="Path to normalized target NDVI (float32)"
    )
    target_masked_path: str = Field(
        ..., description="Path to cloud-masked target (boolean mask)"
    )
    reference_normalized_path: Optional[str] = Field(
        None, description="Path to reference NDVI for temporal comparison"
    )
    reference_cloud_mask_path: Optional[str] = None
    target_cloud_mask_path: Optional[str] = None
    crs_wkt: Optional[str] = Field(
        None, description="Coordinate Reference System as WKT"
    )
    transform_gdal: Optional[tuple] = Field(
        None, description="Geotransform 6-tuple (x_off, x_scale, x_rot, y_off, y_rot, y_scale)"
    )


class SceneMetadataRequest(BaseModel):
    """Scene acquisition and context metadata."""
    
    scene_id: str = Field(..., description="Unique scene identifier")
    acquired_at: str = Field(
        ..., description="ISO 8601 acquisition timestamp"
    )
    watch_id: str = Field(..., description="Associated watch area ID")
    cloud_cover: float = Field(
        0.0, description="Cloud cover percentage [0, 100]"
    )
    region: Optional[str] = None
    collection_date: Optional[str] = None


class DetectionRequest(BaseModel):
    """Request to run detection on a preprocessed scene."""
    
    aoi_wkt: str = Field(
        ..., description="Area of interest as WKT polygon (EPSG:4326)"
    )
    preprocessing_result: PreprocessingResultRequest
    scene_metadata: SceneMetadataRequest
    methods: Optional[list[str]] = Field(
        None, description="Specific detectors to run (default: all)"
    )


class AnomalyScoreResponse(BaseModel):
    """Single anomaly score from a detector."""
    
    method: str
    score: float
    explanation: Optional[str] = None
    spatial_extents: Optional[dict] = None


class DetectorResultResponse(BaseModel):
    """Result from one detector."""
    
    method: str
    status: str  # "success", "insufficient_data", "error"
    anomalies: list[AnomalyScoreResponse]
    processing_time_ms: float
    error_msg: Optional[str] = None


class DetectionResponse(BaseModel):
    """Complete detection result for one scene."""
    
    watch_id: str
    scene_id: str
    composite_score: float = Field(description="Aggregated anomaly score [0, 1]")
    is_anomaly: bool = Field(description="Whether score exceeds threshold")
    composite_threshold: float
    contributing_methods: list[str] = Field(
        description="Which detectors found anomalies"
    )
    details: dict[str, DetectorResultResponse] = Field(
        description="Per-detector breakdown"
    )


# ============================================================================
# ROUTE: POST /api/detections/run
# ============================================================================

@router.post("/run", response_model=DetectionResponse)
async def run_detection(req: DetectionRequest) -> DetectionResponse:
    """
    Run full anomaly detection pipeline for a scene.
    
    Pipeline:
    1. Load preprocessed GeoTIFF arrays into DetectionInput
    2. Execute registered detectors in parallel (temporal, spatial, historical)
    3. Aggregate results via configurable mode (max/mean/voting)
    4. Return composite alert with contributing methods
    
    Args:
        req: Detection request with preprocessing output paths and metadata
    
    Returns:
        DetectionResponse with composite score and per-detector details
    
    Raises:
        HTTPException: on data loading/processing errors
    
    Example:
        POST /api/detections/run
        {
            "aoi_wkt": "POLYGON((34.5 0, 34.6 0, 34.6 0.1, 34.5 0.1, 34.5 0))",
            "preprocessing_result": {
                "target_normalized_path": "/data/target_norm.tif",
                "target_masked_path": "/data/target_mask.tif",
                "reference_normalized_path": "/data/reference_norm.tif"
            },
            "scene_metadata": {
                "scene_id": "S2A_MSIL2A_20240315...",
                "acquired_at": "2024-03-15T06:26:41Z",
                "watch_id": "watch_001",
                "cloud_cover": 8.3
            }
        }
    
    Response:
        {
            "watch_id": "watch_001",
            "scene_id": "S2A_MSIL2A_20240315...",
            "composite_score": 0.73,
            "is_anomaly": true,
            "composite_threshold": 0.5,
            "contributing_methods": ["temporal", "historical"],
            "details": {
                "temporal": {...},
                "spatial": {...},
                "historical": {...}
            }
        }
    """
    if DETECTION_SERVICE is None:
        raise HTTPException(status_code=500, detail="Detection service not initialized")
    
    try:
        # Step 1: Load preprocessed arrays into DetectionInput
        logger.info(f"Loading detection input for watch {req.scene_metadata.watch_id}...")
        
        preprocessing_result = PreprocessingResult(
            reference_aligned_path="",  # Not needed for detection
            target_aligned_path="",
            reference_masked_path=req.preprocessing_result.reference_cloud_mask_path,
            target_masked_path=req.preprocessing_result.target_masked_path,
            reference_normalized_path=req.preprocessing_result.reference_normalized_path,
            target_normalized_path=req.preprocessing_result.target_normalized_path,
            reference_cloud_mask_path=req.preprocessing_result.reference_cloud_mask_path,
            target_cloud_mask_path=req.preprocessing_result.target_cloud_mask_path,
            crs_wkt=req.preprocessing_result.crs_wkt,
            transform_gdal=req.preprocessing_result.transform_gdal,
        )
        
        detection_input = PreprocessedDataLoader.from_preprocessing_result(
            preprocessing_result=preprocessing_result,
            aoi_wkt=req.aoi_wkt,
            scene_metadata=req.scene_metadata.dict(),
        )
        
        logger.info(f"Loaded detection input: {detection_input.metadata['scene_id']}")
        
        # Step 2: Run detectors in parallel
        logger.info(f"Running detectors: {req.methods or 'all'}")
        
        detection_results = await DETECTION_SERVICE.run_detection(
            detection_input,
            methods=req.methods,
        )
        
        # Step 3: Aggregate results
        composite = DETECTION_SERVICE.aggregate_results(detection_results)
        
        logger.info(
            f"Detection complete: composite_score={composite.composite_score:.3f}, "
            f"is_anomaly={composite.is_anomaly}, "
            f"methods={composite.contributing_methods}"
        )
        
        # Step 4: Prepare response
        details = {}
        for method, result in detection_results.items():
            details[method] = DetectorResultResponse(
                method=result.method.value,
                status=result.status,
                anomalies=[
                    AnomalyScoreResponse(
                        method=a.method.value if hasattr(a.method, 'value') else str(a.method),
                        score=a.score,
                        explanation=a.explanation,
                        spatial_extents=a.spatial_extents,
                    )
                    for a in result.anomalies
                ],
                processing_time_ms=result.processing_time_ms,
                error_msg=result.error_msg,
            )
        
        return DetectionResponse(
            watch_id=req.scene_metadata.watch_id,
            scene_id=req.scene_metadata.scene_id,
            composite_score=composite.composite_score,
            is_anomaly=composite.is_anomaly,
            composite_threshold=DETECTION_SERVICE.composite_threshold,
            contributing_methods=composite.contributing_methods,
            details=details,
        )
        
    except DataLoadError as e:
        logger.error(f"Data loading failed: {e}")
        raise HTTPException(status_code=422, detail=f"Data loading error: {str(e)}")
    
    except Exception as e:
        logger.error(f"Detection pipeline failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


# ============================================================================
# ROUTE: GET /api/detections/detectors
# ============================================================================

@router.get("/detectors")
def list_available_detectors():
    """
    List all available detection methods.
    
    Response:
        {
            "available": ["temporal", "spatial", "historical"],
            "descriptions": {
                "temporal": "Frame-to-frame NDVI change detection",
                "spatial": "Regional deviation from neighbors",
                "historical": "Seasonal baseline anomaly detection"
            }
        }
    """
    from groundshift.core.detection import DetectorRegistry
    
    detectors = DetectorRegistry.list_available()
    descriptions = {
        "temporal": "Frame-to-frame NDVI change detection (requires prior scene)",
        "spatial": "Regional z-score deviation detection (spatial anomalies)",
        "historical": "Seasonal baseline comparison (historical anomalies)",
    }
    
    return {
        "available": detectors,
        "descriptions": {d: descriptions.get(d, "Custom detector") for d in detectors},
    }


# ============================================================================
# ROUTE: POST /api/detections/run-selective
# ============================================================================

@router.post("/run-selective", response_model=DetectionResponse)
async def run_selective_detection(
    req: DetectionRequest,
    methods: str = Query(..., description="Comma-separated detector names (e.g., 'temporal,spatial')"),
) -> DetectionResponse:
    """
    Run subset of detectors (faster for targeted analysis).
    
    Args:
        req: Detection request
        methods: Comma-separated detector names
    
    Example:
        POST /api/detections/run-selective?methods=temporal,spatial
    """
    requested_methods = [m.strip() for m in methods.split(",")]
    req.methods = requested_methods
    
    return await run_detection(req)


# ============================================================================
# ROUTE: POST /api/detections/batch
# ============================================================================

from typing import Sequence

class BatchDetectionRequest(BaseModel):
    """Batch detection request for time series."""
    
    aoi_wkt: str
    watch_id: str
    preprocessing_results: list[PreprocessingResultRequest]
    scene_metadata_list: list[SceneMetadataRequest]


@router.post("/batch")
async def run_batch_detection(req: BatchDetectionRequest):
    """
    Run detection on multiple scenes (time series).
    
    Useful for:
    - Monthly anomaly monitoring
    - Seasonal baseline computation
    - Time series analysis
    
    Returns: list of DetectionResponse objects
    """
    if len(req.preprocessing_results) != len(req.scene_metadata_list):
        raise HTTPException(
            status_code=422,
            detail="preprocessing_results and scene_metadata_list must have same length"
        )
    
    results = []
    
    for preprocessing_req, scene_meta in zip(
        req.preprocessing_results, req.scene_metadata_list
    ):
        detection_req = DetectionRequest(
            aoi_wkt=req.aoi_wkt,
            preprocessing_result=preprocessing_req,
            scene_metadata=scene_meta,
        )
        
        result = await run_detection(detection_req)
        results.append(result)
    
    return {"watch_id": req.watch_id, "results": results}


# ============================================================================
# HOW TO INTEGRATE INTO main.py
# ============================================================================

"""
In groundshift/api/main.py:

from fastapi import FastAPI
from groundshift.api.routes.detections import router as detection_router, initialize_detection_service

app = FastAPI()

@app.on_event("startup")
async def startup():
    initialize_detection_service()
    logger.info("Detection service started")

# Include detection routes
app.include_router(detection_router)

# Other routers...
app.include_router(alert_routes)
app.include_router(watch_routes)
"""


# ============================================================================
# WORKFLOW: Detection → Alert Persistence
# ============================================================================

"""
After detection returns composite result, integrate with alerting:

from groundshift.core.alerting.service import AlertingService

async def create_alert_from_detection(detection_result: DetectionResponse):
    if detection_result.is_anomaly:
        alerting_service = AlertingService()
        
        alert_id = alerting_service.create_alert(
            watch_id=detection_result.watch_id,
            scene_id=detection_result.scene_id,
            composite_score=detection_result.composite_score,
            contributing_methods=detection_result.contributing_methods,
            details=detection_result.details,
        )
        
        logger.info(f"Created alert {alert_id} for watch {detection_result.watch_id}")
        
        return alert_id
    else:
        logger.info(f"No anomaly detected for {detection_result.scene_id}")
        return None
"""
