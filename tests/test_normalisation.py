from __future__ import annotations

from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
rasterio = pytest.importorskip("rasterio")
from rasterio.transform import from_origin

from groundshift.core.preprocessing.models import PreprocessingRequest, PreprocessingResult
from groundshift.core.preprocessing.normalisation import apply_normalisation


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


def test_apply_normalisation_uses_non_cloud_pixels_for_zscore(tmp_path: Path) -> None:
    reference_path = tmp_path / "reference_masked.tif"
    target_path = tmp_path / "target_masked.tif"

    reference_data = np.array(
        [
            [
                [0, 10, 20, 30],
                [0, 40, 50, 60],
                [0, 70, 80, 90],
                [0, 15, 25, 35],
            ],
            [
                [0, 5, 15, 25],
                [0, 35, 45, 55],
                [0, 65, 75, 85],
                [0, 95, 10, 20],
            ],
        ],
        dtype=np.uint16,
    )
    target_data = np.array(
        [
            [
                [0, 12, 22, 32],
                [0, 42, 52, 62],
                [0, 72, 82, 92],
                [0, 16, 26, 36],
            ],
            [
                [0, 7, 17, 27],
                [0, 37, 47, 57],
                [0, 67, 77, 87],
                [0, 97, 12, 22],
            ],
        ],
        dtype=np.uint16,
    )
    transform = from_origin(500000, 1400000, 10, 10)

    _write_test_geotiff(path=reference_path, data=reference_data, crs="EPSG:32643", transform=transform)
    _write_test_geotiff(path=target_path, data=target_data, crs="EPSG:32643", transform=transform)

    request = PreprocessingRequest(
        reference_scene_path=str(reference_path),
        target_scene_path=str(target_path),
        output_dir=str(tmp_path / "normalized"),
    )
    result = PreprocessingResult(
        reference_aligned_path=str(reference_path),
        target_aligned_path=str(target_path),
        reference_masked_path=str(reference_path),
        target_masked_path=str(target_path),
    )

    normalized_result = apply_normalisation(result, request)

    with rasterio.open(normalized_result.reference_normalized_path) as reference_norm:
        ref_norm_data = reference_norm.read()

    for band in ref_norm_data:
        cloud_pixels = band == 0
        assert np.any(cloud_pixels)

        non_cloud_pixels = band != 0
        assert np.any(non_cloud_pixels)
        assert abs(float(np.mean(band[non_cloud_pixels]))) < 1e-5
        assert np.min(band[non_cloud_pixels]) >= -3.0
        assert np.max(band[non_cloud_pixels]) <= 3.0


def test_apply_normalisation_skips_fully_clouded_and_flat_bands(tmp_path: Path) -> None:
    reference_path = tmp_path / "reference_masked.tif"
    target_path = tmp_path / "target_masked.tif"

    scene_data = np.array(
        [
            [
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
            ],
            [
                [0, 25, 25],
                [0, 25, 25],
                [0, 25, 25],
            ],
        ],
        dtype=np.uint16,
    )
    transform = from_origin(500000, 1400000, 10, 10)

    _write_test_geotiff(path=reference_path, data=scene_data, crs="EPSG:32643", transform=transform)
    _write_test_geotiff(path=target_path, data=scene_data, crs="EPSG:32643", transform=transform)

    request = PreprocessingRequest(
        reference_scene_path=str(reference_path),
        target_scene_path=str(target_path),
        output_dir=str(tmp_path / "normalized"),
    )
    result = PreprocessingResult(
        reference_aligned_path=str(reference_path),
        target_aligned_path=str(target_path),
        reference_masked_path=str(reference_path),
        target_masked_path=str(target_path),
    )

    normalized_result = apply_normalisation(result, request)

    with rasterio.open(normalized_result.reference_normalized_path) as reference_norm:
        ref_norm_data = reference_norm.read()

    assert np.all(ref_norm_data[0] == 0)
    assert np.all(ref_norm_data[1] == 0)
