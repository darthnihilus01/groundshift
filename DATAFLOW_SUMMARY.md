# Clean Data Flow: Preprocessing to Detection

## Summary

A complete, layered data flow architecture has been designed and partially implemented for the groundshift detection engine. The flow transforms raw satellite scenes through 6 distinct layers, each with clean input/output contracts.

---

## What Was Delivered

### 1. **Architecture Documentation** 
📄 [DETECTION_DATAFLOW_ARCHITECTURE.md](DETECTION_DATAFLOW_ARCHITECTURE.md)

**400+ line comprehensive guide** covering:
- **6-layer architecture** with data transformation at each stage
- **Module contracts** (inputs, outputs, responsibilities)
- **Memory management strategy** (typical array sizes: ~40 MB per scene)
- **Data guarantees** (dtype, shape, normalization, georeferencing)
- **Extension points** (adding custom detectors, data sources, aggregation modes)
- **Complete end-to-end example** with real scene workflow
- **Checkpoint table** showing transformations at each step

### 2. **Data Loading Implementation**
📝 [data_loader.py](data_loader.py)

**PreprocessedDataLoader class** (~300 lines):
- `load_array()` - Read GeoTIFF into float32 numpy arrays
- `from_preprocessing_result()` - Convert PreprocessingResult → DetectionInput
- `from_batch_preprocessing_results()` - Time series batch loading
- Full validation with error handling
- Memory-efficient conditional loading
- Graceful fallbacks for missing/corrupt data

**Updated Module Exports:**
- Added to [__init__.py](/__init__.py) for easy import

### 3. **Workflow Examples**
📋 [WORKFLOWS.md](WORKFLOWS.md)

**8 Common Development Patterns** with runnable code:
1. Single scene detection pipeline
2. Selective detection (specific methods)
3. Custom detector registration
4. Batch time series processing
5. Aggregation mode testing
6. Error handling & fallbacks
7. Memory-efficient loading
8. Debugging individual detectors

### 4. **FastAPI Integration Guide**
🔌 [groundshift/api/routes/DETECTION_INTEGRATION.md](groundshift/api/routes/DETECTION_INTEGRATION.md)

**Complete Route Implementation** covering:
- `POST /api/detections/run` - Full detection pipeline
- `GET /api/detections/detectors` - List available methods
- `POST /api/detections/run-selective` - Specific detector subset
- `POST /api/detections/batch` - Time series processing
- Pydantic request/response models
- Integration with main.py startup events
- Alert persistence workflow

---

## The 6 Layers

### Layer 1: Ingestion
```
INPUT:  IngestionRequest (AOI + date range + cloud threshold)
OUTPUT: DownloadedScene[] (file paths + metadata)
```
**Module:** `IngestionService`  
**Format:** Scene ID, local path, acquisition date, cloud cover %, footprint

### Layer 2: Preprocessing
```
INPUT:  PreprocessingRequest (reference scene + target scene + output dir)
OUTPUT: PreprocessingResult (file paths to GeoTIFFs)
```
**Module:** `PreprocessingService` (coregister → cloud mask → normalize)  
**Operations:**
- Coregister scenes to common grid
- Apply cloud masks
- Min-max normalize to [0, 1]
- Output georeferenced COG GeoTIFFs

### Layer 3: Data Loading (NEW)
```
INPUT:  PreprocessingResult (file paths)
OUTPUT: DetectionInput (in-memory numpy arrays)
```
**Module:** `PreprocessedDataLoader`  
**Operations:**
- Load normalized NDVI arrays
- Load cloud masks
- Extract georeferencing metadata
- Validate shape consistency

### Layer 4: Detection Orchestration
```
INPUT:  DetectionInput (arrays + metadata)
OUTPUT: DetectionResult[] (per-detector results)
```
**Module:** `AsyncDetectionService` + `DetectorRegistry`  
**Operations:**
- Registry pattern instantiates detectors
- Parallel async execution via `asyncio.gather()`
- Exception handling per detector
- Timing instrumentation

### Layer 5: Result Aggregation
```
INPUT:  DetectionResult[] (multiple detector outputs)
OUTPUT: CompositeDetectionResult (single composite alert)
```
**Module:** `AsyncDetectionService.aggregate_results()`  
**Modes:**
- `max` - Any strong signal triggers
- `mean` - Multiple weak signals required
- `voting` - Consensus threshold

### Layer 6: Alerting
```
INPUT:  CompositeDetectionResult
OUTPUT: Alert record (if is_anomaly=True)
```
**Module:** `AlertingService` (to be connected)  
**Operations:**
- Threshold check (`composite_score >= threshold`)
- Alert database insertion
- Message queue publication
- Logging

---

## Data Format Contracts

| Layer | Type | Format | Size Estimate |
|-------|------|--------|---|
| **Ingestion** | DownloadedScene | File paths + metadata | None (metadata only) |
| **Preprocessing** | PreprocessingResult | GeoTIFF file paths | ~5 files × 50-100 MB |
| **Data Loading** | DetectionInput | NumPy arrays in-memory | ~40 MB (target + reference + mask) |
| **Detection** | DetectionResult[] | Anomaly scores + metadata | ~1-10 KB per detector |
| **Aggregation** | CompositeDetectionResult | Single score + methods | ~1 KB |
| **Alerting** | Alert record | DB row | ~1-10 KB |

---

## Key Design Principles

### ✅ Clean Separation of Concerns
- Each layer has single responsibility
- Stateless module design
- No circular dependencies

### ✅ Data Transparency
- Clear input/output formats at each boundary
- Type-safe (Pydantic + NumPy dtypes)
- Explicit data guarantees (shape, dtype, range)

### ✅ Extensibility
- Registry factory pattern for detectors
- Easy to add custom detectors (subclass AsyncDetector)
- Pluggable aggregation strategies (max/mean/voting)
- Optional data loading (skip reference if not needed)

### ✅ Error Resilience
- Per-detector exception handling
- Graceful fallbacks for missing files
- Validation at borders (PreprocessedDataLoader)
- Detailed error messages for debugging

### ✅ Performance-Aware
- Parallel async detector execution
- Memory-efficient conditional loading
- ~40 MB peak memory per scene (scale-friendly)
- Timing instrumentation built-in

---

## Typical Workflow

```python
# 1. Get preprocessing output
preprocessing_result = PreprocessingService().run(request)

# 2. Load into detection format
detection_input = PreprocessedDataLoader.from_preprocessing_result(
    preprocessing_result,
    aoi_wkt="...",
    scene_metadata={...}
)

# 3. Run detectors in parallel
detection_service = AsyncDetectionService(...)
results = await detection_service.run_detection(detection_input)

# 4. Aggregate and alert
composite = detection_service.aggregate_results(results)

if composite.is_anomaly:
    alerting_service.create_alert(...)
```

---

## Extension: Adding a New Detector

```python
from groundshift.core.detection import AsyncDetector, DetectorRegistry

class MyCustomDetector(AsyncDetector):
    @property
    def method_name(self) -> str:
        return "my_detector"
    
    async def detect(self, inp: DetectionInput) -> DetectionResult:
        # Implementation
        pass

# Auto-register on import
DetectorRegistry.register("my_detector", MyCustomDetector)
```

---

## What's Next

### Immediate (1-2 hours)
- [ ] Test `PreprocessedDataLoader` with real preprocessing outputs
- [ ] Verify array shapes and georeferencing extraction
- [ ] Create unit tests for data validation

### Short-term (1-2 days)
- [ ] Implement FastAPI routes (use [DETECTION_INTEGRATION.md](DETECTION_INTEGRATION.md))
- [ ] Wire detection service into `main.py` startup
- [ ] Connect results to alerting service

### Medium-term (1-2 weeks)
- [ ] Replace simulated data sources in detectors:
  - TemporalDetector: Query actual prior scenes
  - SpatialDetector: Spatial index for neighbor stats
  - HistoricalDetector: Data warehouse baseline queries
- [ ] Implement alert persistence (DB INSERT)
- [ ] Add request cancellation tokens for long-running operations

---

## Files Modified/Created

**New Files:**
- `groundshift/core/detection/data_loader.py` (295 lines)
- `DETECTION_DATAFLOW_ARCHITECTURE.md` (450 lines)
- `groundshift/core/detection/WORKFLOWS.md` (280 lines)
- `groundshift/api/routes/DETECTION_INTEGRATION.md` (330 lines)

**Modified Files:**
- `groundshift/core/detection/__init__.py` (added DataLoadError, PreprocessedDataLoader exports)

---

## Reference

- **Architecture**: [DETECTION_DATAFLOW_ARCHITECTURE.md](DETECTION_DATAFLOW_ARCHITECTURE.md)
- **Implementation**: [data_loader.py](data_loader.py)
- **Workflows**: [WORKFLOWS.md](WORKFLOWS.md)
- **API Routes**: [groundshift/api/routes/DETECTION_INTEGRATION.md](groundshift/api/routes/DETECTION_INTEGRATION.md)
