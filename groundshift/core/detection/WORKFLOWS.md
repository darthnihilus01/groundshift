"""
QUICK REFERENCE: Detection Data Flow

Common development workflows and code snippets.
"""

# ==============================================================================
# WORKFLOW 1: Single Scene Detection Pipeline
# ==============================================================================
# Use case: Process one new scene through full detection pipeline

from groundshift.core.detection import (
    PreprocessedDataLoader,
    AsyncDetectionService,
)
from groundshift.core.preprocessing.models import PreprocessingResult

async def detect_single_scene():
    """Full pipeline: preprocessing → detection → alert."""
    
    # 1. Get preprocessing output (from PreprocessingService.run())
    preprocessing_result = PreprocessingResult(
        reference_aligned_path="/data/ref_aligned.tif",
        target_aligned_path="/data/tgt_aligned.tif",
        reference_masked_path="/data/ref_masked.tif",
        target_masked_path="/data/tgt_masked.tif",
        reference_normalized_path="/data/ref_normalized.tif",
        target_normalized_path="/data/tgt_normalized.tif",
        reference_cloud_mask_path="/data/ref_cloud.tif",
        target_cloud_mask_path="/data/tgt_cloud.tif",
        crs_wkt="EPSG:32636",
        transform_gdal=(500000.0, 10.0, 0, 0, 0, -10.0),
    )
    
    # 2. Load into DetectionInput (file paths → numpy arrays)
    detection_input = PreprocessedDataLoader.from_preprocessing_result(
        preprocessing_result=preprocessing_result,
        aoi_wkt="POLYGON((34.5 0, 34.6 0, 34.6 0.1, 34.5 0.1, 34.5 0))",
        scene_metadata={
            "scene_id": "S2A_MSIL2A_20240315T062641_N0510_R034_T36MZE",
            "acquired_at": "2024-03-15T06:26:41Z",
            "watch_id": "watch_001",
            "cloud_cover": 8.3,
        },
    )
    
    # 3. Run detectors in parallel
    detection_service = AsyncDetectionService(
        detector_configs={
            "temporal": {"threshold": 0.3, "lookback_days": 30},
            "spatial": {"threshold": 2.0, "buffer_km": 50},
            "historical": {"threshold": 2.0, "baseline_years": 5},
        },
        aggregation_mode="max",
        composite_threshold=0.5,
    )
    
    results = await detection_service.run_detection(detection_input)
    
    # 4. Aggregate and create alert
    composite = detection_service.aggregate_results(results)
    
    return {
        "watch_id": "watch_001",
        "composite_score": composite.composite_score,
        "is_anomaly": composite.is_anomaly,
        "methods": composite.contributing_methods,
    }


# ==============================================================================
# WORKFLOW 2: Selective Detection (Only Temporal)
# ==============================================================================

async def detect_temporal_only(detection_input):
    """Run only temporal detector (faster for quick checks)."""
    
    detection_service = AsyncDetectionService(
        detector_configs={
            "temporal": {"threshold": 0.3, "lookback_days": 30},
        },
        aggregation_mode="max",
        composite_threshold=0.5,
    )
    
    # Run only temporal detector
    results = await detection_service.run_detection(
        detection_input,
        methods=["temporal"]  # Specify which detectors to run
    )
    
    composite = detection_service.aggregate_results(results)
    
    return composite


# ==============================================================================
# WORKFLOW 3: Custom Detector Registration
# ==============================================================================

from groundshift.core.detection import AsyncDetector, DetectorRegistry
from groundshift.core.detection.models_v2 import DetectionInput, DetectionResult

class CustomSpectralDetector(AsyncDetector):
    """Example: Custom spectral change detector."""
    
    @property
    def method_name(self) -> str:
        return "custom_spectral"
    
    async def detect(self, inp: DetectionInput) -> DetectionResult:
        # Implementation here
        pass

# Register at import time (in your module __init__.py)
DetectorRegistry.register("custom_spectral", CustomSpectralDetector)

# Now available in detection service
async def use_custom_detector():
    detection_service = AsyncDetectionService(
        detector_configs={
            "custom_spectral": {"threshold": 0.4},  # New detector!
            "temporal": {"threshold": 0.3},
        },
    )
    # ... rest of pipeline


# ==============================================================================
# WORKFLOW 4: Batch Processing Time Series
# ==============================================================================

async def detect_time_series(scenes: list[PreprocessingResult]):
    """Process multiple scenes (e.g., monthly time series)."""
    
    detection_inputs = PreprocessedDataLoader.from_batch_preprocessing_results(
        preprocessing_results=scenes,
        aoi_wkt="POLYGON((34.5 0, 34.6 0, 34.6 0.1, 34.5 0.1, 34.5 0))",
        scene_metadata_list=[
            {
                "scene_id": f"S2A_{i}",
                "acquired_at": f"2024-0{i+1}-15T06:26:41Z",
                "watch_id": "watch_001",
                "cloud_cover": 5.0,
            }
            for i in range(len(scenes))
        ],
    )
    
    detection_service = AsyncDetectionService(...)
    
    # Process all scenes
    all_results = []
    for detection_input in detection_inputs:
        results = await detection_service.run_detection(detection_input)
        composite = detection_service.aggregate_results(results)
        all_results.append(composite)
    
    return all_results


# ==============================================================================
# WORKFLOW 5: Variable Aggregation Modes
# ==============================================================================

async def test_aggregation_modes(detection_input):
    """Compare different aggregation strategies."""
    
    results = {}
    
    for mode in ["max", "mean", "voting"]:
        service = AsyncDetectionService(
            detector_configs={
                "temporal": {"threshold": 0.3},
                "spatial": {"threshold": 2.0},
                "historical": {"threshold": 2.0},
            },
            aggregation_mode=mode,
            composite_threshold=0.5,
        )
        
        detection_results = await service.run_detection(detection_input)
        composite = service.aggregate_results(detection_results)
        results[mode] = composite.composite_score
    
    return results


# ==============================================================================
# WORKFLOW 6: Error Handling & Graceful Fallback
# ==============================================================================

from groundshift.core.detection import DataLoadError

async def detect_with_error_handling(preprocessing_result):
    """Handle missing files, corrupt data, etc."""
    
    try:
        # Try full detection
        detection_input = PreprocessedDataLoader.from_preprocessing_result(
            preprocessing_result,
            aoi_wkt="POLYGON(...)",
            scene_metadata={"scene_id": "S2A_...", "acquired_at": "2024-03-15"},
        )
        
    except DataLoadError as e:
        print(f"Data loading failed: {e}")
        # Fallback: return neutral result
        return {
            "composite_score": 0.0,
            "is_anomaly": False,
            "error": str(e),
        }
    
    # If we got here, proceed normally
    service = AsyncDetectionService(...)
    results = await service.run_detection(detection_input)
    composite = service.aggregate_results(results)
    
    return composite


# ==============================================================================
# WORKFLOW 7: Memory-Efficient Loading (Skip Temporal)
# ==============================================================================

def load_detection_input_for_spatial_only(preprocessing_result):
    """Skip loading reference scene if only spatial detector runs."""
    
    # Don't load reference NDVI (saves ~16 MB)
    detection_input = PreprocessedDataLoader.from_preprocessing_result(
        preprocessing_result,
        aoi_wkt="POLYGON(...)",
        scene_metadata={"scene_id": "S2A_...", "acquired_at": "2024-03-15"},
        load_reference=False,  # Skip temporal's prior scene
        load_spectral=False,   # Skip spectral bands
    )
    
    return detection_input


# ==============================================================================
# WORKFLOW 8: Debugging Individual Detectors
# ==============================================================================

async def debug_single_detector(detection_input):
    """Run one detector and inspect output in detail."""
    
    from groundshift.core.detection import TemporalDetector
    
    detector = TemporalDetector(config={"threshold": 0.3, "lookback_days": 30})
    result = await detector.detect(detection_input)
    
    print(f"Status: {result.status}")
    print(f"Processing time: {result.processing_time_ms} ms")
    print(f"Anomalies found: {len(result.anomalies)}")
    
    for anomaly in result.anomalies:
        print(f"  - {anomaly.method}: score={anomaly.score:.3f}")
        print(f"    Explanation: {anomaly.explanation}")
    
    return result


# ==============================================================================
# CONSTANTS & TYPICAL VALUES
# ==============================================================================

TYPICAL_ARRAY_SIZE = {
    "ndvi": "2048 × 2048 × 4 bytes = 16 MB",
    "cloud_mask": "2048 × 2048 × 1 byte = 4 MB",
    "reference_ndvi": "2048 × 2048 × 4 bytes = 16 MB",
    "total_peak": "~40 MB for single scene",
}

DETECTOR_CONFIGS = {
    "temporal": {
        "threshold": 0.3,  # Flag if >30% NDVI change
        "lookback_days": 30,
    },
    "spatial": {
        "threshold": 2.0,  # Flag if z-score > 2
        "buffer_km": 50,
    },
    "historical": {
        "threshold": 2.0,  # Flag if seasonal z-score > 2
        "baseline_years": 5,
    },
}

AGGREGATION_MODES = {
    "max": "Any strong signal triggers alert",
    "mean": "Multiple weak signals trigger alert",
    "voting": "Consensus matters (reduces false positives)",
}
