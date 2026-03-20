from __future__ import annotations

from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
rasterio = pytest.importorskip("rasterio")
from rasterio.transform import from_origin

from groundshift.core.preprocessing.cloud_mask import apply_cloud_mask
from groundshift.core.preprocessing.models import PreprocessingRequest, PreprocessingResult


class FakeCloudDetector:
    def __init__(self, probability_map: np.ndarray) -> None:
        self._probability_map = probability_map

    def get_cloud_probability_maps(self, data: np.ndarray) -> np.ndarray:
        batch = data.shape[0]
        return np.repeat(self._probability_map[np.newaxis, ...], batch, axis=0)


def _write_test_geotiff(*, path: Path, data: np.ndarray, crs: str, transform) -> None:
    profile = {
        "driver": "GTiff",
        "height": data.shape[1],
        "width": data.shape[2],
        "count": data.shape[0],
        "dtype": str(data.dtype),
        "crs": crs,
        "transform": transform,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data)


def test_apply_cloud_mask_zeroes_cloudy_pixels(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    reference_path = tmp_path / "reference_aligned.tif"
    target_path = tmp_path / "target_aligned.tif"

    reference_data = np.full((12, 5, 5), 10, dtype=np.uint16)
    target_data = np.full((12, 5, 5), 20, dtype=np.uint16)
    transform = from_origin(500000, 1400000, 10, 10)

    _write_test_geotiff(path=reference_path, data=reference_data, crs="EPSG:32643", transform=transform)
    _write_test_geotiff(path=target_path, data=target_data, crs="EPSG:32643", transform=transform)

    probability = np.zeros((5, 5), dtype=np.float32)
    probability[1, 2] = 0.95

    monkeypatch.setattr(
        "groundshift.core.preprocessing.cloud_mask._build_cloud_detector",
        lambda: FakeCloudDetector(probability),
    )

    request = PreprocessingRequest(
        reference_scene_path=str(reference_path),
        target_scene_path=str(target_path),
        output_dir=str(tmp_path / "masked"),
        cloud_cover_threshold=0.4,
    )
    result = PreprocessingResult(
        reference_aligned_path=str(reference_path),
        target_aligned_path=str(target_path),
    )

    masked_result = apply_cloud_mask(result, request)

    with rasterio.open(masked_result.reference_masked_path) as masked_ref:
        masked_pixels = masked_ref.read()
        assert np.all(masked_pixels[:, 1, 2] == 0)


def test_cloud_mask_shape_matches_scene_shape(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    reference_path = tmp_path / "reference_aligned.tif"
    target_path = tmp_path / "target_aligned.tif"

    scene_data = np.full((12, 6, 4), 100, dtype=np.uint16)
    transform = from_origin(500000, 1400000, 10, 10)

    _write_test_geotiff(path=reference_path, data=scene_data, crs="EPSG:32643", transform=transform)
    _write_test_geotiff(path=target_path, data=scene_data, crs="EPSG:32643", transform=transform)

    probability = np.zeros((6, 4), dtype=np.float32)
    monkeypatch.setattr(
        "groundshift.core.preprocessing.cloud_mask._build_cloud_detector",
        lambda: FakeCloudDetector(probability),
    )

    request = PreprocessingRequest(
        reference_scene_path=str(reference_path),
        target_scene_path=str(target_path),
        output_dir=str(tmp_path / "masked"),
    )
    result = PreprocessingResult(
        reference_aligned_path=str(reference_path),
        target_aligned_path=str(target_path),
    )

    masked_result = apply_cloud_mask(result, request)

    with rasterio.open(masked_result.reference_cloud_mask_path) as cloud_mask:
        mask = cloud_mask.read(1)
        assert mask.shape == (6, 4)


def test_masked_output_preserves_crs_and_transform(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    reference_path = tmp_path / "reference_aligned.tif"
    target_path = tmp_path / "target_aligned.tif"

    scene_data = np.full((12, 4, 4), 100, dtype=np.uint16)
    transform = from_origin(500000, 1400000, 20, 20)

    _write_test_geotiff(path=reference_path, data=scene_data, crs="EPSG:32643", transform=transform)
    _write_test_geotiff(path=target_path, data=scene_data, crs="EPSG:32643", transform=transform)

    probability = np.zeros((4, 4), dtype=np.float32)
    monkeypatch.setattr(
        "groundshift.core.preprocessing.cloud_mask._build_cloud_detector",
        lambda: FakeCloudDetector(probability),
    )

    request = PreprocessingRequest(
        reference_scene_path=str(reference_path),
        target_scene_path=str(target_path),
        output_dir=str(tmp_path / "masked"),
    )
    result = PreprocessingResult(
        reference_aligned_path=str(reference_path),
        target_aligned_path=str(target_path),
    )

    masked_result = apply_cloud_mask(result, request)

    with rasterio.open(reference_path) as source, rasterio.open(masked_result.reference_masked_path) as masked:
        assert masked.crs == source.crs
        assert masked.transform == source.transform


def test_apply_cloud_mask_raises_if_band_count_not_12(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reference_path = tmp_path / "reference_aligned.tif"
    target_path = tmp_path / "target_aligned.tif"

    bad_band_scene = np.full((11, 5, 5), 1, dtype=np.uint16)
    valid_scene = np.full((12, 5, 5), 1, dtype=np.uint16)
    transform = from_origin(500000, 1400000, 10, 10)

    _write_test_geotiff(path=reference_path, data=bad_band_scene, crs="EPSG:32643", transform=transform)
    _write_test_geotiff(path=target_path, data=valid_scene, crs="EPSG:32643", transform=transform)

    probability = np.zeros((5, 5), dtype=np.float32)
    monkeypatch.setattr(
        "groundshift.core.preprocessing.cloud_mask._build_cloud_detector",
        lambda: FakeCloudDetector(probability),
    )

    request = PreprocessingRequest(
        reference_scene_path=str(reference_path),
        target_scene_path=str(target_path),
        output_dir=str(tmp_path / "masked"),
    )
    result = PreprocessingResult(
        reference_aligned_path=str(reference_path),
        target_aligned_path=str(target_path),
    )

    with pytest.raises(ValueError, match="12 bands"):
        apply_cloud_mask(result, request)
