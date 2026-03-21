from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import shapes


def _ring_area(coords: list[list[float]]) -> float:
    if len(coords) < 4:
        return 0.0

    area = 0.0
    for i in range(len(coords) - 1):
        x1, y1 = coords[i]
        x2, y2 = coords[i + 1]
        area += (x1 * y2) - (x2 * y1)
    return abs(area) * 0.5


def _geometry_area(geometry: dict) -> float:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates", [])

    if geometry_type == "Polygon":
        if not coordinates:
            return 0.0
        shell_area = _ring_area(coordinates[0])
        hole_area = sum(_ring_area(ring) for ring in coordinates[1:])
        return max(0.0, shell_area - hole_area)

    if geometry_type == "MultiPolygon":
        total = 0.0
        for polygon in coordinates:
            if not polygon:
                continue
            shell_area = _ring_area(polygon[0])
            hole_area = sum(_ring_area(ring) for ring in polygon[1:])
            total += max(0.0, shell_area - hole_area)
        return total

    return 0.0


def change_scores_to_geojson(
    change_score_path: str,
    threshold: float,
    output_path: Path,
) -> str:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with rasterio.open(change_score_path) as ds:
        scores = ds.read(1).astype(np.float32)

        mask = (scores > np.float32(threshold)).astype(np.uint8)
        shape_iter = shapes(mask, mask=mask.astype(bool), transform=ds.transform)

        features: list[dict] = []
        for geometry, value in shape_iter:
            if int(value) == 0:
                continue

            area = _geometry_area(geometry)
            feature = {
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "change_score": float(value),
                    "area_m2": float(area),
                },
            }
            features.append(feature)

    feature_collection = {
        "type": "FeatureCollection",
        "features": features,
    }

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(feature_collection, f)

    return str(output_path)
