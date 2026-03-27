# Detection Engine Data Flow Architecture

## Overview

Clean, layered data flow from **ingested raw scenes** → **preprocessed arrays** → **detection inputs** → **parallel detectors** → **aggregated composite result**.

```
Raw Scenes (S2)
     ↓
[Ingestion] → DownloadedScene (paths + metadata)
     ↓
[Preprocessing] → PreprocessingResult (aligned, masked, normalized file paths)
     ↓
[Data Loading] → DetectionInput (numpy arrays in-memory)
     ↓
[Detection Orchestration]
     ├→ TemporalDetector    (async)
     ├→ SpatialDetector     (async)
     ├→ HistoricalDetector  (async)
     └→ ...custom detectors (async)
     ↓
[Result Aggregation] → CompositeDetectionResult
     ↓
[Alerting/Persistence]
```

---

## Layer 1: Ingestion Output Format

**Module:** `groundshift.core.ingestion`  
**Output Type:** `IngestionResult`

```python
@dataclass
class IngestionResult:
    requested: IngestionRequest           # AOI, date range, cloud threshold
    matched_scenes: list[SceneSummary]    # Query results
    downloaded_scenes: list[DownloadedScene]  # Downloaded products with paths
```

**DownloadedScene Structure:**
```python
@dataclass
class DownloadedScene:
    scene: SceneSummary                  # Metadata (scene_id, acquired_at, cloud_cover)
    local_path: str                      # Path to uncompressed product (e.g., /data/S2A_.../)
```

**Key Contract:**
- `local_path` points to expanded SAFE/L2A product directory
- Contains subdirectories: `GRANULE/*/IMG_DATA/T*_*_*_*.jp2` (10m/20m/60m bands)
- Metadata available in product `MTD_MSIL2A.xml`

---

## Layer 2: Preprocessing Output Format

**Module:** `groundshift.core.preprocessing`  
**Input:** `PreprocessingRequest` (reference_scene_path, target_scene_path, output_dir)  
**Output Type:** `PreprocessingResult`

```python
@dataclass
class PreprocessingResult:
    reference_aligned_path: str
    target_aligned_path: str
    reference_masked_path: str              # Cloud-masked
    target_masked_path: str
    reference_normalized_path: str          # Min-max normalized
    target_normalized_path: str
    reference_cloud_mask_path: str
    target_cloud_mask_path: str
    crs_wkt: str                            # Output CRS (e.g., UTM)
    transform_gdal: tuple[float, ...]       # Geotransform (6-tuple)
```

**File Format Contract:**
- All outputs are GeoTIFF COG (Cloud Optimized GeoTIFF)
- Shape: `(H, W)` for single-band or `(H, W, C)` for multi-band
- Dtype: `float32` (normalized to [0, 1] where applicable)
- Georeferenced: includes CRS and affine transform
- Same spatial grid across all outputs (co-registered)

**Spatial Output:**
- All arrays resampled to common resolution (e.g., 10m Sentinel-2 native)
- Target dimensions typically 1000–5000 pixels on each axis
- GeoTIFF headers include CRS_WKT and transform_gdal

---

## Layer 3: Data Loading → Detection Input

**New Module:** `groundshift.core.detection.data_loader`  
**Bridge Layer Purpose:** Convert file paths + metadata into in-memory DetectionInput.

### 3a. Data Loading Service

```python
# groundshift/core/detection/data_loader.py

from pathlib import Path
import rasterio
import numpy as np
from groundshift.core.preprocessing.models import PreprocessingResult
from groundshift.core.ingestion.models import DownloadedScene
from groundshift.core.detection.models_v2 import DetectionInput

class PreprocessedDataLoader:
    """Load GeoTIFF outputs from preprocessing into numpy arrays."""
    
    @staticmethod
    def load_array(filepath: str) -> np.ndarray:
        """Load single GeoTIFF into float32 array."""
        with rasterio.open(filepath) as src:
            return src.read().astype(np.float32)
    
    @staticmethod
    def from_preprocessing_result(
        preprocessing_result: PreprocessingResult,
        aoi_wkt: str,
        scene_metadata: dict,
    ) -> DetectionInput:
        """
        Convert PreprocessingResult to DetectionInput.
        
        Loads all normalized/masked arrays from disk into memory.
        """
        # Load current (target) scene
        target_ndvi = PreprocessedDataLoader.load_array(
            preprocessing_result.target_normalized_path
        )
        target_cloud_mask = PreprocessedDataLoader.load_array(
            preprocessing_result.target_cloud_mask_path
        )
        
        # Load reference (prior) scene for temporal comparison
        reference_ndvi = PreprocessedDataLoader.load_array(
            preprocessing_result.reference_normalized_path
        )
        
        return DetectionInput(
            aoi_wkt=aoi_wkt,
            scene_date=scene_metadata['acquired_at'],
            current_scene={
                'ndvi': target_ndvi,
                'cloud_mask': target_cloud_mask,
                'reference_ndvi': reference_ndvi,  # For temporal detector
            },
            collection_date=scene_metadata.get('collection_date'),
            metadata={
                'scene_id': scene_metadata['scene_id'],
                'crs_wkt': preprocessing_result.crs_wkt,
                'transform': preprocessing_result.transform_gdal,
                'cloud_cover': scene_metadata.get('cloud_cover'),
            }
        )
```

**Data Loading Contract:**
- Loads ONLY the normalized target arrays (saves memory)
- Reference scene loaded for temporal detector context
- Cloud masks available for masking anomalies
- Metadata dict includes georeference info (CRS, transform) for spatial operations

---

## Layer 4: Detection Input Format

**Type:** `DetectionInput` (defined in `models_v2.py`)

```python
@dataclass
class DetectionInput:
    aoi_wkt: str                          # AOI polygon (EPSG:4326)
    scene_date: str                       # ISO 8601 timestamp
    current_scene: dict[str, Any]         # Data for this detection run
    collection_date: Optional[str] = None # Prior timestamp (for temporal)
    metadata: Optional[dict[str, Any]] = None
```

### 4a. Current Scene Dict Structure

**Required Keys:**
```python
current_scene = {
    'ndvi': np.ndarray,                   # Shape (H, W), dtype float32, values [0, 1]
    'cloud_mask': np.ndarray,             # Shape (H, W), dtype bool, True=valid
    'crs': str,                           # CRS code (e.g., "EPSG:32633")
}
```

**Optional Keys (detector-specific):**
```python
current_scene = {
    'reference_ndvi': np.ndarray,         # For TemporalDetector (prior scene)
    'red': np.ndarray,                    # For spectral detectors
    'nir': np.ndarray,
    'swir': np.ndarray,
    'blue': np.ndarray,
    'green': np.ndarray,
    'elevation': np.ndarray,              # For topographic analysis
}
```

**Metadata Dict Structure:**
```python
metadata = {
    'scene_id': str,                      # Unique ID (e.g., S2A_20240101T...)
    'watch_id': str,                      # Associated watch area ID
    'region': str,                        # Geographic region or country
    'crs_wkt': str,                       # Full WKT CRS definition
    'transform': tuple,                   # GDAL geotransform (6-tuple)
    'cloud_cover': float,                 # Percent [0, 100]
    'acquired_at': str,                   # ISO 8601 acquisition timestamp
}
```

**Data Guarantees:**
- All arrays **same spatial dimensions** (H, W)
- All arrays **float32** or **bool**
- All values **pre-normalized** to [0, 1] range (except cloud_mask)
- All arrays **georeferenced** (CRS/transform in metadata)
- Invalid/cloudy pixels **masked** via cloud_mask boolean array

---

## Layer 5: Detection Module Registration & Orchestration

**Module:** `groundshift.core.detection`

### 5a. Detector Interface (AsyncDetector)

Each detector implements:
```python
class AsyncDetector(ABC):
    def __init__(self, config: dict):
        """Initialize with detector-specific configuration."""
        self.config = config
    
    @property
    def method_name(self) -> str:
        """Return DetectionMethod enum value."""
        raise NotImplementedError
    
    async def detect(self, inp: DetectionInput) -> DetectionResult:
        """Run detection; return result with anomalies list."""
        raise NotImplementedError
```

### 5b. Detector Registry (Factory)

```python
# groundshift/core/detection/registry.py

class DetectorRegistry:
    _detectors = {}
    
    @staticmethod
    def register(name: str, detector_class: type[AsyncDetector]):
        """Auto-called on module import; registers detector by name."""
        DetectorRegistry._detectors[name] = detector_class
    
    @staticmethod
    def get(name: str, config: dict) -> AsyncDetector:
        """Instantiate detector by registry name."""
        if name not in DetectorRegistry._detectors:
            raise ValueError(f"Unknown detector: {name}")
        return DetectorRegistry._detectors[name](config)
    
    @staticmethod
    def list_available() -> list[str]:
        """List all registered detector names."""
        return list(DetectorRegistry._detectors.keys())
```

**Auto-Registration on Import:**
```python
# In temporal.py, spatial.py, historical.py at module level:
DetectorRegistry.register("temporal", TemporalDetector)
DetectorRegistry.register("spatial", SpatialDetector)
DetectorRegistry.register("historical", HistoricalDetector)
```

### 5c. Parallel Orchestration

```python
# groundshift/core/detection/async_service.py

class AsyncDetectionService:
    def __init__(
        self,
        detector_configs: dict[str, dict],      # {"temporal": {...}, "spatial": {...}}
        aggregation_mode: str = "max",          # "max" | "mean" | "voting"
        composite_threshold: float = 0.5,
    ):
        self.detectors = {
            name: DetectorRegistry.get(name, cfg)
            for name, cfg in detector_configs.items()
        }
        self.aggregation_mode = aggregation_mode
        self.composite_threshold = composite_threshold
    
    async def run_detection(
        self,
        inp: DetectionInput,
        methods: Optional[list[str]] = None,
    ) -> dict[str, DetectionResult]:
        """
        Run subset (or all) detectors in parallel.
        
        Returns: {"temporal": DetectionResult, "spatial": DetectionResult, ...}
        """
        methods = methods or list(self.detectors.keys())
        tasks = [
            self._run_detector_safe(name, self.detectors[name], inp)
            for name in methods if name in self.detectors
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return dict(zip(methods, results))
```

---

## Layer 6: Detection Result Format

**Type:** `DetectionResult` (per-detector)

```python
@dataclass
class DetectionResult:
    method: DetectionMethod               # Which detector
    anomalies: list[AnomalyScore]         # List of detected anomalies
    processing_time_ms: float             # Timing metadata
    status: str                           # "success" | "insufficient_data" | "error"
    error_msg: Optional[str] = None       # Error details if status != "success"
```

**AnomalyScore Structure:**
```python
@dataclass
class AnomalyScore:
    method: DetectionMethod
    score: float                          # [0, 1] confidence
    spatial_extents: Optional[dict]       # {"type": "bbox", "bounds": [...]}
    explanation: Optional[str]            # "NDVI change > 15%"
```

**Example Return (TemporalDetector):**
```python
DetectionResult(
    method=DetectionMethod.TEMPORAL,
    anomalies=[
        AnomalyScore(
            method=DetectionMethod.TEMPORAL,
            score=0.87,
            spatial_extents={"type": "pixels", "count": 1245},
            explanation="22% NDVI drop vs. 30-day prior"
        )
    ],
    processing_time_ms=245.3,
    status="success",
)
```

---

## Layer 7: Result Aggregation

**Type:** `CompositeDetectionResult`

```python
@dataclass
class CompositeDetectionResult:
    composite_score: float                # Aggregated [0, 1]
    is_anomaly: bool                      # Score >= threshold?
    contributing_methods: list[str]       # Which detectors triggered
    details: dict[str, DetectionResult]   # Per-detector breakdown
```

### 7a. Aggregation Strategies

**Mode 1: Max (Default)**
```python
composite_score = max(
    max(a.score for a in result.anomalies)
    for result in results.values()
    if result.status == "success"
)
```
Use when: Any strong signal should trigger alert.

**Mode 2: Mean**
```python
scores = [
    max(a.score for a in result.anomalies)
    for result in results.values()
    if result.status == "success"
]
composite_score = sum(scores) / len(scores) if scores else 0.0
```
Use when: Multiple weak signals indicate anomaly.

**Mode 3: Voting**
```python
votes = sum(
    1 for result in results.values()
    if result.status == "success" and result.anomalies
)
composite_score = votes / len(results)  # Fraction of detectors that flagged
```
Use when: Consensus matters (reduces false positives).

### 7b. Contributing Methods

```python
contributing_methods = [
    result.method.value
    for result in results.values()
    if result.status == "success" and result.anomalies
]
```

---

## Complete Data Flow Example

### Input: Watch Area with New Scene

```python
watch = {
    'id': 'watch_001',
    'aoi_wkt': 'POLYGON((34.5 0, 34.6 0, 34.6 0.1, 34.5 0.1, 34.5 0))',
    'region': 'East Africa',
}

scene_metadata = {
    'scene_id': 'S2A_MSIL2A_20240315T062641_N0510_R034_T36MZE_20240315T062637.SAFE',
    'acquired_at': '2024-03-15T06:26:41Z',
    'cloud_cover': 8.3,
}
```

### Step 1: Ingestion

```python
ingestion_service = IngestionService()
ingestion_result = ingestion_service.run(
    IngestionRequest(
        aoi_wkt=watch['aoi_wkt'],
        start_date=date(2024, 3, 15),
        end_date=date(2024, 3, 15),
        max_cloud_cover=20.0,
    )
)

# Result: /data/S2A_MSIL2A_20240315_T36MZE/ (downloaded SAFE product)
```

### Step 2: Preprocessing

```python
preprocessing_service = PreprocessingService()
preprocessing_result = preprocessing_service.run(
    PreprocessingRequest(
        reference_scene_path='/data/S2A_MSIL2A_20240308_T36MZE/',  # Prior
        target_scene_path='/data/S2A_MSIL2A_20240315_T36MZE/',     # Current
        output_dir='/data/preprocessed/',
    )
)

# Result paths:
# - /data/preprocessed/target_normalized.tif  (NDVI [0,1])
# - /data/preprocessed/target_masked.tif      (cloud mask)
# - /data/preprocessed/reference_normalized.tif (prior NDVI)
```

### Step 3: Data Loading

```python
data_loader = PreprocessedDataLoader()
detection_input = data_loader.from_preprocessing_result(
    preprocessing_result=preprocessing_result,
    aoi_wkt=watch['aoi_wkt'],
    scene_metadata={
        **scene_metadata,
        'watch_id': watch['id'],
        'crs': 'EPSG:32636',
    }
)

# detection_input.current_scene['ndvi'] = ndarray shape (2048, 2048)
# detection_input.current_scene['cloud_mask'] = ndarray shape (2048, 2048) dtype bool
# detection_input.metadata['scene_id'] = 'S2A_MSIL2A_...'
```

### Step 4: Parallel Detection

```python
detection_service = AsyncDetectionService(
    detector_configs={
        'temporal': {'threshold': 0.3, 'lookback_days': 30},
        'spatial': {'threshold': 2.0, 'buffer_km': 50},
        'historical': {'threshold': 2.0, 'baseline_years': 5},
    },
    aggregation_mode='max',
    composite_threshold=0.5,
)

results = await detection_service.run_detection(detection_input)

# results = {
#     'temporal': DetectionResult(...),
#     'spatial': DetectionResult(...),
#     'historical': DetectionResult(...),
# }
```

### Step 5: Result Aggregation & Alert

```python
composite = detection_service.aggregate_results(results)

# composite.composite_score = 0.73
# composite.is_anomaly = True  (0.73 > 0.5)
# composite.contributing_methods = ['temporal', 'historical']

if composite.is_anomaly:
    alert_id = alerting_service.create_alert(
        watch_id=watch['id'],
        scene_id=scene_metadata['scene_id'],
        composite_score=composite.composite_score,
        contributing_methods=composite.contributing_methods,
    )
```

---

## Data Transformation Checkpoints

| Checkpoint | Input | Output | Module | Format |
|---|---|---|---|---|
| **Ingestion** | Catalog query | File paths, metadata | `IngestionService` | `DownloadedScene[]` |
| **Preprocessing** | Raw scenes | Normalized GeoTIFFs | `PreprocessingService` | `PreprocessingResult` |
| **Data Loading** | GeoTIFF paths | In-memory arrays | `PreprocessedDataLoader` | `DetectionInput` |
| **Detection** | DetectionInput | Per-detector results | `AsyncDetectionService` | `DetectionResult[]` |
| **Aggregation** | DetectionResult[] | Composite alert | `ResultAggregator` | `CompositeDetectionResult` |
| **Persistence** | CompositeDetectionResult | Alert record | `AlertingService` | Alert ID |

---

## Memory Management Strategy

### Array Sizes

For typical Sentinel-2 tile (2048×2048 at 10m resolution):
- Single NDVI array: `2048 × 2048 × 4 bytes = 16 MB`
- Cloud mask: `2048 × 2048 × 1 byte = 4 MB`
- Reference + Target + Cloud mask: **~36 MB total**

### Loading Policy

```python
class PreprocessedDataLoader:
    # Load ONLY normalized target arrays at detection time
    # Load reference NDVI only if temporal detector enabled
    # Load spectral bands only if spectral detector enabled
    
    @staticmethod
    def from_preprocessing_result(
        preprocessing_result,
        aoi_wkt,
        scene_metadata,
        load_reference: bool = True,      # False = skip temporal
        load_spectral: bool = False,      # True if spectral detector active
    ):
        # Conditional loading based on active detectors
        pass
```

---

## Extension Points

### Adding a New Detector

```python
# groundshift/core/detection/my_detector.py

from groundshift.core.detection.async_base import AsyncDetector
from groundshift.core.detection.models_v2 import DetectionInput, DetectionResult
from groundshift.core.detection.registry import DetectorRegistry

class MyDetector(AsyncDetector):
    @property
    def method_name(self) -> str:
        return "my_custom_detector"
    
    async def detect(self, inp: DetectionInput) -> DetectionResult:
        # Implementation
        pass

# Auto-register on import
DetectorRegistry.register("my_detector", MyDetector)
```

### Adding a New Data Source

```python
# Extend DetectionInput to include new data

current_scene = {
    'ndvi': np.array(...),
    'my_custom_band': np.array(...),  # New data
}

metadata = {
    'my_custom_metadata': value,  # New context
}

# Detectors consume via inp.current_scene.get('my_custom_band')
```

### Changing Aggregation Strategy

```python
# Swap aggregation modes at runtime
detection_service = AsyncDetectionService(
    detector_configs={...},
    aggregation_mode='voting',  # Changed from 'max'
    composite_threshold=0.6,
)
```

---

## Summary: Clean Data Flow Contracts

| Layer | I/O Contract | Responsibility |
|---|---|---|
| **Ingestion** | Query → Paths | Find & download raw scenes |
| **Preprocessing** | Paths → GeoTIFF files | Align, mask, normalize |
| **Data Loading** | Files → NumPy arrays | Load into DetectionInput |
| **Detection** | DetectionInput → DetectionResult[] | Run anomaly detectors in parallel |
| **Aggregation** | DetectionResult[] → CompositeDetectionResult | Combine scores, filter with threshold |
| **Alerting** | CompositeDetectionResult → Alert DB | Persist high-confidence anomalies |

Each layer is **stateless**, **testable**, and **independently scalable**.
