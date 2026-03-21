from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_bounds

from groundshift.core.alerting.geojson import change_scores_to_geojson
from groundshift.core.alerting.models import AlertRequest
from groundshift.core.alerting.service import AlertService


def make_change_scores(path: Path, data: np.ndarray, *, left: float = 0.0, bottom: float = 0.0, right: float = 1.0, top: float = 1.0) -> None:
    transform = from_bounds(left, bottom, right, top, data.shape[1], data.shape[0])
    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "count": 1,
        "height": data.shape[0],
        "width": data.shape[1],
        "crs": "EPSG:4326",
        "transform": transform,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data[np.newaxis, ...].astype(np.float32))


def read_geojson(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def test_geojson_output_contains_only_polygons_above_threshold(tmp_path):
    change_scores = np.array(
        [
            [0.1, 0.9],
            [0.2, 0.8],
        ],
        dtype=np.float32,
    )
    tif_path = tmp_path / "scores.tif"
    out_path = tmp_path / "out.geojson"
    make_change_scores(tif_path, change_scores)

    change_scores_to_geojson(str(tif_path), threshold=0.5, output_path=out_path)
    data = read_geojson(out_path)

    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == 1
    for feature in data["features"]:
        assert feature["properties"]["change_score"] > 0.0


def test_alert_fired_is_false_when_nothing_exceeds_threshold(tmp_path):
    change_scores = np.zeros((4, 4), dtype=np.float32)
    tif_path = tmp_path / "scores.tif"
    make_change_scores(tif_path, change_scores)

    request = AlertRequest(
        change_score_path=str(tif_path),
        threshold=0.5,
        aoi_wkt="POLYGON((0 0,1 0,1 1,0 1,0 0))",
        scene_date="2024-01-01",
        output_dir=str(tmp_path / "output"),
    )
    result = AlertService().run(request)

    assert result.alert_fired is False
    assert result.mean_change_score == 0.0


def test_alert_fired_is_true_when_pixels_exceed_threshold(tmp_path):
    change_scores = np.zeros((4, 4), dtype=np.float32)
    change_scores[1:3, 1:3] = 0.9
    tif_path = tmp_path / "scores.tif"
    make_change_scores(tif_path, change_scores)

    request = AlertRequest(
        change_score_path=str(tif_path),
        threshold=0.5,
        aoi_wkt="POLYGON((0 0,1 0,1 1,0 1,0 0))",
        scene_date="2024-01-02",
        output_dir=str(tmp_path / "output"),
    )
    result = AlertService().run(request)

    assert result.alert_fired is True
    assert result.changed_area_fraction > 0.0


def test_geojson_coordinates_are_real_world_not_pixel_coords(tmp_path):
    change_scores = np.zeros((2, 2), dtype=np.float32)
    change_scores[0, 0] = 1.0
    tif_path = tmp_path / "scores.tif"
    out_path = tmp_path / "out.geojson"
    make_change_scores(tif_path, change_scores, left=10.0, bottom=20.0, right=12.0, top=22.0)

    change_scores_to_geojson(str(tif_path), threshold=0.5, output_path=out_path)
    data = read_geojson(out_path)

    coords = data["features"][0]["geometry"]["coordinates"][0]
    first_x, first_y = coords[0]
    assert first_x >= 10.0
    assert first_y >= 20.0


def test_webhook_post_is_called_when_url_provided(tmp_path, monkeypatch):
    change_scores = np.zeros((3, 3), dtype=np.float32)
    change_scores[1, 1] = 0.8
    tif_path = tmp_path / "scores.tif"
    make_change_scores(tif_path, change_scores)

    captured: dict = {}

    class DummyResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_urlopen(req):
        captured["url"] = req.full_url
        captured["method"] = req.get_method()
        captured["body"] = req.data
        return DummyResponse()

    monkeypatch.setattr("groundshift.core.alerting.service.urllib.request.urlopen", fake_urlopen)

    request = AlertRequest(
        change_score_path=str(tif_path),
        threshold=0.5,
        aoi_wkt="POLYGON((0 0,1 0,1 1,0 1,0 0))",
        scene_date="2024-01-03",
        output_dir=str(tmp_path / "output"),
        webhook_url="https://example.test/alert",
    )
    AlertService().run(request)

    assert captured["url"] == "https://example.test/alert"
    assert captured["method"] == "POST"
    assert captured["body"] is not None


def test_output_is_valid_geojson_feature_collection(tmp_path):
    change_scores = np.zeros((3, 3), dtype=np.float32)
    change_scores[0:2, 0:2] = 0.7
    tif_path = tmp_path / "scores.tif"
    out_path = tmp_path / "out.geojson"
    make_change_scores(tif_path, change_scores)

    change_scores_to_geojson(str(tif_path), threshold=0.5, output_path=out_path)
    data = read_geojson(out_path)

    assert data["type"] == "FeatureCollection"
    assert isinstance(data["features"], list)
    if data["features"]:
        feature = data["features"][0]
        assert feature["type"] == "Feature"
        assert feature["geometry"]["type"] in {"Polygon", "MultiPolygon"}
        assert "change_score" in feature["properties"]
        assert "area_m2" in feature["properties"]
