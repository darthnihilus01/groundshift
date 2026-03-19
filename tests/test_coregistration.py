from __future__ import annotations

from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
rasterio = pytest.importorskip("rasterio")
from rasterio.transform import from_origin

from groundshift.core.preprocessing.coregistration import coregister_scenes
from groundshift.core.preprocessing.models import PreprocessingRequest


def _write_test_geotiff(
    *,
    path: Path,
    data: np.ndarray,
    crs: str,
    transform,
) -> None:
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


def test_coregistration_reprojects_target_when_crs_mismatch(tmp_path: Path) -> None:
    reference_path = tmp_path / "reference.tif"
    target_path = tmp_path / "target.tif"

    reference = np.ones((2, 16, 16), dtype=np.float32)
    target = np.full((2, 16, 16), 5.0, dtype=np.float32)

    _write_test_geotiff(
        path=reference_path,
        data=reference,
        crs="EPSG:32643",
        transform=from_origin(500000, 1400000, 10, 10),
    )
    _write_test_geotiff(
        path=target_path,
        data=target,
        crs="EPSG:4326",
        transform=from_origin(77.5, 13.0, 0.0001, 0.0001),
    )

    request = PreprocessingRequest(
        reference_scene_path=str(reference_path),
        target_scene_path=str(target_path),
        output_dir=str(tmp_path / "aligned"),
    )

    result = coregister_scenes(request)

    with rasterio.open(result.reference_aligned_path) as reference_ds, rasterio.open(
        result.target_aligned_path
    ) as target_ds:
        assert reference_ds.crs is not None
        assert target_ds.crs == reference_ds.crs
        assert target_ds.transform == reference_ds.transform
        assert target_ds.width == reference_ds.width
        assert target_ds.height == reference_ds.height
        assert result.crs_wkt == reference_ds.crs.to_wkt()
