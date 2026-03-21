from __future__ import annotations

import json
import logging
from pathlib import Path
import urllib.request

from groundshift.core.alerting.geojson import change_scores_to_geojson
from groundshift.core.alerting.models import AlertRequest, AlertResult

logger = logging.getLogger(__name__)


def _parse_wkt_polygon_area(wkt: str) -> float:
    text = wkt.strip()
    prefix = "POLYGON(("
    suffix = "))"
    if not text.upper().startswith(prefix) or not text.endswith(suffix):
        return 0.0

    coord_blob = text[len(prefix):-len(suffix)]
    points: list[tuple[float, float]] = []
    for pair in coord_blob.split(","):
        parts = pair.strip().split()
        if len(parts) < 2:
            continue
        points.append((float(parts[0]), float(parts[1])))

    if len(points) < 4:
        return 0.0

    area = 0.0
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        area += (x1 * y2) - (x2 * y1)
    return abs(area) * 0.5


class AlertService:
    def run(self, request: AlertRequest) -> AlertResult:
        output_dir = Path(request.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        geojson_path = output_dir / "alerts.geojson"

        out_path = change_scores_to_geojson(
            change_score_path=request.change_score_path,
            threshold=request.threshold,
            output_path=geojson_path,
        )

        with open(out_path, "r", encoding="utf-8") as f:
            payload = json.load(f)

        features = payload.get("features", [])
        alert_fired = len(features) > 0

        if alert_fired:
            scores = [float(feature["properties"].get("change_score", 0.0)) for feature in features]
            mean_change_score = float(sum(scores) / len(scores))
            changed_area = float(
                sum(float(feature["properties"].get("area_m2", 0.0)) for feature in features)
            )
        else:
            mean_change_score = 0.0
            changed_area = 0.0

        total_aoi_area = _parse_wkt_polygon_area(request.aoi_wkt)
        if total_aoi_area <= 0.0:
            changed_area_fraction = 0.0
        else:
            changed_area_fraction = float(changed_area / total_aoi_area)

        result = AlertResult(
            geojson_path=out_path,
            alert_fired=alert_fired,
            mean_change_score=mean_change_score,
            changed_area_fraction=changed_area_fraction,
            scene_date=request.scene_date,
            aoi_wkt=request.aoi_wkt,
        )

        if request.webhook_url:
            body = json.dumps(
                {
                    "geojson_path": result.geojson_path,
                    "alert_fired": result.alert_fired,
                    "mean_change_score": result.mean_change_score,
                    "changed_area_fraction": result.changed_area_fraction,
                    "scene_date": result.scene_date,
                    "aoi_wkt": result.aoi_wkt,
                }
            ).encode("utf-8")
            req = urllib.request.Request(
                request.webhook_url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req):
                pass

        logger.info(
            "Alert processing complete for scene %s; alert_fired=%s",
            request.scene_date,
            alert_fired,
        )

        return result
