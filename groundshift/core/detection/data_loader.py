"""
Data loading bridge: Convert preprocessed GeoTIFF outputs to DetectionInput.

This module handles the critical layer between:
- PreprocessingResult (file paths) → DetectionInput (in-memory arrays)

Responsibilities:
- Load GeoTIFF files into numpy arrays
- Validate data consistency (shape, dtype, georeferencing)
- Handle missing/error states gracefully
- Memory-efficient loading (load only required data)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional, Any

import numpy as np
import rasterio
from rasterio.errors import RasterioIOError

from groundshift.core.preprocessing.models import PreprocessingResult
from groundshift.core.detection.models_v2 import DetectionInput

logger = logging.getLogger(__name__)


class DataLoadError(Exception):
    """Raised when data loading or validation fails."""

    pass


class PreprocessedDataLoader:
    """Load GeoTIFF outputs from preprocessing into numpy arrays."""

    @staticmethod
    def load_array(filepath: str, band: Optional[int] = None) -> np.ndarray:
        """
        Load single GeoTIFF into float32 array.

        Args:
            filepath: Path to GeoTIFF file.
            band: Specific band to read (1-indexed). If None, read all bands.

        Returns:
            ndarray with shape (H, W) for single band or (C, H, W) for multi-band.

        Raises:
            DataLoadError: If file cannot be read or is invalid.
        """
        try:
            with rasterio.open(filepath) as src:
                if band is not None:
                    # Read specific band
                    data = src.read(band)
                else:
                    # Read all bands
                    data = src.read()
                return data.astype(np.float32)
        except (RasterioIOError, RuntimeError) as e:
            raise DataLoadError(f"Failed to load {filepath}: {e}")

    @staticmethod
    def validate_array(
        arr: np.ndarray,
        name: str,
        expected_shape: Optional[tuple] = None,
        expected_dtype: Optional[np.dtype] = None,
    ) -> None:
        """
        Validate array properties (shape, dtype, NaN/Inf).

        Args:
            arr: Array to validate.
            name: Array name for error messages.
            expected_shape: Expected shape (ignored if None).
            expected_dtype: Expected dtype (ignored if None).

        Raises:
            DataLoadError: If validation fails.
        """
        if arr is None:
            raise DataLoadError(f"{name} is None")

        if expected_dtype is not None and arr.dtype != expected_dtype:
            logger.warning(
                f"{name} dtype mismatch: expected {expected_dtype}, got {arr.dtype}. "
                "Will cast to expected dtype."
            )
            arr = arr.astype(expected_dtype)

        if expected_shape is not None and arr.shape != expected_shape:
            raise DataLoadError(
                f"{name} shape mismatch: expected {expected_shape}, got {arr.shape}"
            )

        if np.isnan(arr).any():
            logger.warning(f"{name} contains {np.isnan(arr).sum()} NaN values")

        if np.isinf(arr).any():
            logger.warning(f"{name} contains {np.isinf(arr).sum()} Inf values")

    @staticmethod
    def load_geotransform(filepath: str) -> tuple:
        """
        Extract GDAL geotransform from GeoTIFF.

        Returns 6-tuple: (x_origin, pixel_width, row_rotation, y_origin, col_rotation, pixel_height)
        """
        try:
            with rasterio.open(filepath) as src:
                transform = src.transform
                return (
                    transform.c,  # x_origin
                    transform.a,  # pixel_width
                    transform.b,  # row_rotation
                    transform.f,  # y_origin
                    transform.d,  # col_rotation
                    transform.e,  # pixel_height
                )
        except Exception as e:
            raise DataLoadError(f"Failed to read geotransform from {filepath}: {e}")

    @staticmethod
    def load_crs_wkt(filepath: str) -> Optional[str]:
        """Extract CRS WKT from GeoTIFF."""
        try:
            with rasterio.open(filepath) as src:
                if src.crs is not None:
                    return src.crs.to_wkt()
                return None
        except Exception as e:
            logger.warning(f"Failed to read CRS from {filepath}: {e}")
            return None

    @staticmethod
    def from_preprocessing_result(
        preprocessing_result: PreprocessingResult,
        aoi_wkt: str,
        scene_metadata: dict[str, Any],
        load_reference: bool = True,
        load_spectral: bool = False,
    ) -> DetectionInput:
        """
        Convert PreprocessingResult to DetectionInput.

        Loads normalized/masked arrays from disk into memory for detection inference.

        Args:
            preprocessing_result: Output from PreprocessingService.
            aoi_wkt: Area of interest polygon (EPSG:4326).
            scene_metadata: Scene info dict with keys:
                - 'acquired_at' (ISO 8601 timestamp)
                - 'scene_id' (unique identifier)
                - optionally: 'collection_date', 'cloud_cover', 'region'
            load_reference: If True, load reference NDVI for temporal detector.
            load_spectral: If True, load red/nir bands (future extension).

        Returns:
            DetectionInput ready for detection pipeline.

        Raises:
            DataLoadError: If required files are missing or corrupt.
        """
        logger.info(f"Loading preprocessed data from {preprocessing_result}")

        # Validate required paths exist
        if not preprocessing_result.target_normalized_path:
            raise DataLoadError("target_normalized_path is required")
        if not preprocessing_result.target_masked_path:
            raise DataLoadError("target_masked_path is required")
        if not Path(preprocessing_result.target_normalized_path).exists():
            raise DataLoadError(
                f"Target normalized not found: {preprocessing_result.target_normalized_path}"
            )
        if not Path(preprocessing_result.target_masked_path).exists():
            raise DataLoadError(
                f"Target masked not found: {preprocessing_result.target_masked_path}"
            )

        try:
            # Load current (target) NDVI
            logger.debug("Loading target NDVI...")
            target_ndvi = PreprocessedDataLoader.load_array(
                preprocessing_result.target_normalized_path
            )

            # Load cloud mask (valid pixel indicator)
            logger.debug("Loading target cloud mask...")
            target_cloud_mask = PreprocessedDataLoader.load_array(
                preprocessing_result.target_masked_path
            )

            # Ensure consistent shapes
            if target_ndvi.shape != target_cloud_mask.shape:
                raise DataLoadError(
                    f"Shape mismatch: NDVI {target_ndvi.shape} vs "
                    f"cloud_mask {target_cloud_mask.shape}"
                )

            reference_ndvi = None
            if load_reference and preprocessing_result.reference_normalized_path:
                if Path(preprocessing_result.reference_normalized_path).exists():
                    logger.debug("Loading reference NDVI for temporal comparison...")
                    reference_ndvi = PreprocessedDataLoader.load_array(
                        preprocessing_result.reference_normalized_path
                    )
                    if reference_ndvi.shape != target_ndvi.shape:
                        logger.warning(
                            f"Reference shape {reference_ndvi.shape} != "
                            f"target shape {target_ndvi.shape}, skipping temporal"
                        )
                        reference_ndvi = None
                else:
                    logger.warning(
                        f"Reference file not found: "
                        f"{preprocessing_result.reference_normalized_path}"
                    )

            # Build current_scene dict
            current_scene = {
                "ndvi": target_ndvi,
                "cloud_mask": target_cloud_mask,
            }

            if reference_ndvi is not None:
                current_scene["reference_ndvi"] = reference_ndvi

            # Extract georeferencing metadata
            logger.debug("Extracting georeferencing metadata...")
            geotransform = PreprocessedDataLoader.load_geotransform(
                preprocessing_result.target_normalized_path
            )
            crs_wkt = PreprocessedDataLoader.load_crs_wkt(
                preprocessing_result.target_normalized_path
            )

            # Build metadata dict
            metadata = {
                "scene_id": scene_metadata.get("scene_id", "unknown"),
                "acquired_at": scene_metadata.get("acquired_at"),
                "watch_id": scene_metadata.get("watch_id"),
                "region": scene_metadata.get("region"),
                "crs_wkt": crs_wkt,
                "transform": geotransform,
                "cloud_cover": scene_metadata.get("cloud_cover"),
                "collection_date": scene_metadata.get("collection_date"),
            }

            # Remove None values
            metadata = {k: v for k, v in metadata.items() if v is not None}

            logger.info(
                f"Loaded detection input for {metadata['scene_id']}: "
                f"NDVI shape {target_ndvi.shape}, "
                f"cloud mask shape {target_cloud_mask.shape}, "
                f"reference available: {reference_ndvi is not None}"
            )

            return DetectionInput(
                aoi_wkt=aoi_wkt,
                scene_date=scene_metadata["acquired_at"],
                current_scene=current_scene,
                collection_date=scene_metadata.get("collection_date"),
                metadata=metadata,
            )

        except Exception as e:
            logger.error(f"Error loading preprocessed data: {e}")
            raise

    @staticmethod
    def from_batch_preprocessing_results(
        preprocessing_results: list[PreprocessingResult],
        aoi_wkt: str,
        scene_metadata_list: list[dict[str, Any]],
    ) -> list[DetectionInput]:
        """
        Batch load multiple preprocessed results.

        Args:
            preprocessing_results: List of PreprocessingResult objects.
            aoi_wkt: Shared AOI polygon.
            scene_metadata_list: Parallel list of scene metadata dicts.

        Returns:
            List of DetectionInput objects.
        """
        if len(preprocessing_results) != len(scene_metadata_list):
            raise ValueError(
                f"Length mismatch: {len(preprocessing_results)} results vs "
                f"{len(scene_metadata_list)} metadata"
            )

        detection_inputs = []
        for result, metadata in zip(preprocessing_results, scene_metadata_list):
            try:
                inp = PreprocessedDataLoader.from_preprocessing_result(
                    result, aoi_wkt, metadata
                )
                detection_inputs.append(inp)
            except DataLoadError as e:
                logger.error(f"Failed to load {metadata.get('scene_id')}: {e}")
                raise

        return detection_inputs


# Runtime usage example (not executed by default)
if __name__ == "__main__":
    # Example: Load a single scene
    from groundshift.core.preprocessing.models import PreprocessingResult

    preprocessing_result = PreprocessingResult(
        reference_aligned_path="/data/preprocessed/reference_aligned.tif",
        target_aligned_path="/data/preprocessed/target_aligned.tif",
        reference_masked_path="/data/preprocessed/reference_masked.tif",
        target_masked_path="/data/preprocessed/target_masked.tif",
        reference_normalized_path="/data/preprocessed/reference_normalized.tif",
        target_normalized_path="/data/preprocessed/target_normalized.tif",
        reference_cloud_mask_path="/data/preprocessed/reference_cloud_mask.tif",
        target_cloud_mask_path="/data/preprocessed/target_cloud_mask.tif",
    )

    scene_metadata = {
        "scene_id": "S2A_MSIL2A_20240315T062641_N0510_R034_T36MZE",
        "acquired_at": "2024-03-15T06:26:41Z",
        "watch_id": "watch_001",
        "cloud_cover": 8.3,
    }

    detection_input = PreprocessedDataLoader.from_preprocessing_result(
        preprocessing_result=preprocessing_result,
        aoi_wkt="POLYGON((34.5 0, 34.6 0, 34.6 0.1, 34.5 0.1, 34.5 0))",
        scene_metadata=scene_metadata,
    )

    print(f"Loaded detection input: {detection_input}")
