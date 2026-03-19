from __future__ import annotations

from datetime import date
from datetime import datetime

from groundshift.core.ingestion.cache import TileCache
from groundshift.core.ingestion.models import DownloadedScene, SceneSummary
from groundshift.core.ingestion.providers.base import SceneProvider


class SentinelSatProvider(SceneProvider):
    """sentinelsat-backed provider for Sentinel-2 L2A products.

    Geospatial note: catalog footprints can span different UTM zones. We pass
    AOI as WKT and keep footprint WKT in metadata so CRS-aware preprocessing can
    reproject explicitly later.
    """

    def __init__(self, *, username: str, password: str, api_url: str | None = None) -> None:
        try:
            from sentinelsat import SentinelAPI
        except ImportError as exc:
            raise RuntimeError(
                "sentinelsat is required for SentinelSatProvider. Install with "
                "`pip install groundshift[ingestion]`."
            ) from exc

        self._api = SentinelAPI(username, password, api_url=api_url)

    def search_scenes(
        self,
        *,
        aoi_wkt: str,
        start_date: date,
        end_date: date,
        max_cloud_cover: float,
        limit: int,
    ) -> list[SceneSummary]:
        products = self._api.query(
            area=aoi_wkt,
            date=(start_date.isoformat(), end_date.isoformat()),
            platformname="Sentinel-2",
            producttype="S2MSI2A",
            cloudcoverpercentage=(0, max_cloud_cover),
        )

        scenes: list[SceneSummary] = []
        for scene_id, metadata in products.items():
            beginposition = metadata.get("beginposition")
            if isinstance(beginposition, str):
                acquired_at = datetime.fromisoformat(beginposition.replace("Z", "+00:00"))
            else:
                acquired_at = beginposition

            if acquired_at is None:
                continue

            cloud_cover = metadata.get("cloudcoverpercentage")
            if cloud_cover is None:
                cloud_cover = metadata.get("cloudcover", 100.0)

            scenes.append(
                SceneSummary(
                    scene_id=scene_id,
                    title=metadata.get("title", scene_id),
                    acquired_at=acquired_at,
                    cloud_cover=float(cloud_cover),
                    footprint_wkt=metadata.get("footprint"),
                    relative_orbit=metadata.get("relativeorbitnumber"),
                    tile_id=metadata.get("tileid"),
                    product_type=metadata.get("producttype", "S2MSI2A"),
                    platform_name=metadata.get("platformname", "Sentinel-2"),
                )
            )

        scenes.sort(key=lambda item: item.acquired_at, reverse=True)
        return scenes[:limit]

    def download_scenes(
        self,
        *,
        scenes: list[SceneSummary],
        cache: TileCache,
    ) -> list[DownloadedScene]:
        downloaded: list[DownloadedScene] = []

        for scene in scenes:
            existing = cache.existing_files(scene.scene_id)
            if existing:
                downloaded.append(
                    DownloadedScene(scene=scene, local_path=str(existing[0]))
                )
                continue

            destination = cache.scene_dir(scene.scene_id)
            result = self._api.download(scene.scene_id, directory_path=str(destination))
            path = result.get("path")
            if not path:
                raise RuntimeError(f"Download did not return a file path for scene {scene.scene_id}")

            downloaded.append(DownloadedScene(scene=scene, local_path=str(path)))

        return downloaded
