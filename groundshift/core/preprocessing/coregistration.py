from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject

from groundshift.core.preprocessing.models import PreprocessingRequest, PreprocessingResult


def coregister_scenes(request: PreprocessingRequest) -> PreprocessingResult:
    """Align target pixels to the reference scene grid.

    The reference scene is treated as authoritative. If CRS, transform, or
    raster shape differ, the target scene is reprojected to the reference grid.
    """

    output_dir = Path(request.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    reference_out = output_dir / "reference_aligned.tif"
    target_out = output_dir / "target_aligned.tif"

    with rasterio.open(request.reference_scene_path) as reference_ds, rasterio.open(
        request.target_scene_path
    ) as target_ds:
        if reference_ds.crs is None:
            raise ValueError("Reference scene is missing CRS metadata")
        if target_ds.crs is None:
            raise ValueError("Target scene is missing CRS metadata")

        reference_profile = reference_ds.profile.copy()
        reference_data = reference_ds.read()

        # Preserve reference raster exactly so downstream steps inherit stable
        # geospatial metadata (CRS, transform, width, height).
        with rasterio.open(reference_out, "w", **reference_profile) as dst:
            dst.write(reference_data)

        target_dtype = np.dtype(target_ds.dtypes[0])
        target_data = np.zeros(
            (target_ds.count, reference_ds.height, reference_ds.width),
            dtype=target_dtype,
        )

        for band_index in range(1, target_ds.count + 1):
            reproject(
                source=rasterio.band(target_ds, band_index),
                destination=target_data[band_index - 1],
                src_transform=target_ds.transform,
                src_crs=target_ds.crs,
                dst_transform=reference_ds.transform,
                dst_crs=reference_ds.crs,
                resampling=Resampling.bilinear,
            )

        target_profile = target_ds.profile.copy()
        target_profile.update(
            {
                "driver": "GTiff",
                "height": reference_ds.height,
                "width": reference_ds.width,
                "transform": reference_ds.transform,
                "crs": reference_ds.crs,
                "count": target_ds.count,
                "dtype": str(target_dtype),
            }
        )

        with rasterio.open(target_out, "w", **target_profile) as dst:
            dst.write(target_data)

        return PreprocessingResult(
            reference_aligned_path=str(reference_out),
            target_aligned_path=str(target_out),
            crs_wkt=reference_ds.crs.to_wkt(),
            transform_gdal=tuple(reference_ds.transform.to_gdal()),
        )
