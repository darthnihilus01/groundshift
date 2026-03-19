from __future__ import annotations

from dataclasses import asdict
from datetime import date
from pathlib import Path

from groundshift.core.ingestion.cache import TileCache
from groundshift.core.ingestion.models import IngestionRequest, IngestionResult
from groundshift.core.ingestion.providers.base import SceneProvider


class IngestionService:
    """Coordinates scene search and download for one AOI/date window."""

    def __init__(self, *, provider: SceneProvider, cache_dir: str | Path) -> None:
        self.provider = provider
        self.cache = TileCache(cache_dir)

    def ingest(self, request: IngestionRequest) -> IngestionResult:
        if request.start_date > request.end_date:
            raise ValueError("start_date must be before or equal to end_date")
        if request.limit <= 0:
            raise ValueError("limit must be greater than 0")
        if not (0.0 <= request.max_cloud_cover <= 100.0):
            raise ValueError("max_cloud_cover must be in range [0, 100]")

        matched = self.provider.search_scenes(
            aoi_wkt=request.aoi_wkt,
            start_date=request.start_date,
            end_date=request.end_date,
            max_cloud_cover=request.max_cloud_cover,
            limit=request.limit,
        )

        downloaded = self.provider.download_scenes(scenes=matched, cache=self.cache)
        return IngestionResult(
            requested=request,
            matched_scenes=matched,
            downloaded_scenes=downloaded,
        )

    @staticmethod
    def result_to_dict(result: IngestionResult) -> dict:
        return asdict(result)


def parse_iso_date(value: str) -> date:
    return date.fromisoformat(value)
