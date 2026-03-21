from __future__ import annotations
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_bounds
from pathlib import Path

from groundshift.core.detection.models import DetectionRequest
from groundshift.core.detection.service import DetectionService


def make_scene(path: Path, data: np.ndarray) -> None:
    """Write a fake 12-band float32 GeoTIFF for testing."""
    transform = from_bounds(0, 0, 1, 1, data.shape[2], data.shape[1])
    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "count": data.shape[0],
        "height": data.shape[1],
        "width": data.shape[2],
        "crs": "EPSG:4326",
        "transform": transform,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data)


def test_detection_service_returns_result_with_all_fields(tmp_path):
    # identical scenes - valid result should still be returned
    data = np.random.rand(12, 32, 32).astype(np.float32)
    ref_path = tmp_path / "reference.tif"
    tgt_path = tmp_path / "target.tif"
    make_scene(ref_path, data)
    make_scene(tgt_path, data)

    request = DetectionRequest(
        reference_path=str(ref_path),
        target_path=str(tgt_path),
        output_dir=str(tmp_path / "output"),
    )
    result = DetectionService().run(request)

    assert result.change_score_path is not None
    assert result.crs_wkt is not None
    assert result.transform_gdal is not None
    assert isinstance(result.mean_change_score, float)
    assert isinstance(result.changed_area_fraction, float)


def test_detection_service_mean_score_is_zero_for_identical_scenes(tmp_path):
    data = np.random.rand(12, 32, 32).astype(np.float32)
    ref_path = tmp_path / "reference.tif"
    tgt_path = tmp_path / "target.tif"
    make_scene(ref_path, data)
    make_scene(tgt_path, data)

    request = DetectionRequest(
        reference_path=str(ref_path),
        target_path=str(tgt_path),
        output_dir=str(tmp_path / "output"),
    )
    result = DetectionService().run(request)
    assert result.mean_change_score == pytest.approx(0.0, abs=1e-5)


def test_detection_service_raises_for_unknown_detector(tmp_path):
    data = np.random.rand(12, 32, 32).astype(np.float32)
    ref_path = tmp_path / "reference.tif"
    tgt_path = tmp_path / "target.tif"
    make_scene(ref_path, data)
    make_scene(tgt_path, data)

    request = DetectionRequest(
        reference_path=str(ref_path),
        target_path=str(tgt_path),
        output_dir=str(tmp_path / "output"),
        detector_name="nonexistent",
    )
    with pytest.raises(ValueError, match="Unknown detector"):
        DetectionService().run(request)


def test_detection_service_raises_for_shape_mismatch(tmp_path):
    ref_data = np.random.rand(12, 32, 32).astype(np.float32)
    tgt_data = np.random.rand(12, 64, 64).astype(np.float32)
    ref_path = tmp_path / "reference.tif"
    tgt_path = tmp_path / "target.tif"
    make_scene(ref_path, ref_data)
    make_scene(tgt_path, tgt_data)

    request = DetectionRequest(
        reference_path=str(ref_path),
        target_path=str(tgt_path),
        output_dir=str(tmp_path / "output"),
    )
    with pytest.raises(ValueError, match="shape mismatch"):
        DetectionService().run(request)


def test_detection_service_output_is_float32(tmp_path):
    data = np.random.rand(12, 32, 32).astype(np.float32)
    ref_path = tmp_path / "reference.tif"
    tgt_path = tmp_path / "target.tif"
    make_scene(ref_path, data)
    make_scene(tgt_path, data)

    request = DetectionRequest(
        reference_path=str(ref_path),
        target_path=str(tgt_path),
        output_dir=str(tmp_path / "output"),
    )
    result = DetectionService().run(request)

    with rasterio.open(result.change_score_path) as ds:
        assert ds.dtypes[0] == "float32"
