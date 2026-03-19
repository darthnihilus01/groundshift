from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

from groundshift.core.ingestion.cache import TileCache
from groundshift.core.ingestion.models import DownloadedScene, SceneSummary


class SceneProvider(ABC):
    """Provider abstraction for catalog search and product download."""

    @abstractmethod
    def search_scenes(
        self,
        *,
        aoi_wkt: str,
        start_date: date,
        end_date: date,
        max_cloud_cover: float,
        limit: int,
    ) -> list[SceneSummary]:
        raise NotImplementedError

    @abstractmethod
    def download_scenes(
        self,
        *,
        scenes: list[SceneSummary],
        cache: TileCache,
    ) -> list[DownloadedScene]:
        raise NotImplementedError
