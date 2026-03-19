from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, timezone

import pytest

from groundshift.core.ingestion.cache import TileCache
from groundshift.core.ingestion.models import (
    DownloadedScene,
    IngestionRequest,
    SceneSummary,
)
from groundshift.core.ingestion.providers.base import SceneProvider
from groundshift.core.ingestion.service import IngestionService


class FakeProvider(SceneProvider):
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def search_scenes(
        self,
        *,
        aoi_wkt: str,
        start_date: date,
        end_date: date,
        max_cloud_cover: float,
        limit: int,
    ) -> list[SceneSummary]:
        self.calls.append(
            {
                "aoi_wkt": aoi_wkt,
                "start_date": start_date,
                "end_date": end_date,
                "max_cloud_cover": max_cloud_cover,
                "limit": limit,
            }
        )
        return [
            SceneSummary(
                scene_id="scene-1",
                title="scene-one",
                acquired_at=datetime(2024, 1, 3, tzinfo=timezone.utc),
                cloud_cover=11.0,
            )
        ]

    def download_scenes(
        self,
        *,
        scenes: list[SceneSummary],
        cache: TileCache,
    ) -> list[DownloadedScene]:
        return [
            DownloadedScene(scene=scenes[0], local_path=str(cache.scene_dir("scene-1") / "scene-1.zip"))
        ]


@pytest.fixture
def ingest_request() -> IngestionRequest:
    return IngestionRequest(
        aoi_wkt="POLYGON((77.5 12.9,77.6 12.9,77.6 13.0,77.5 13.0,77.5 12.9))",
        start_date=date(2024, 1, 1),
        end_date=date(2024, 1, 31),
        max_cloud_cover=20.0,
        limit=10,
    )


def test_ingestion_service_wires_search_and_download(tmp_path, ingest_request: IngestionRequest) -> None:
    provider = FakeProvider()
    service = IngestionService(provider=provider, cache_dir=tmp_path)

    result = service.ingest(ingest_request)

    assert len(result.matched_scenes) == 1
    assert len(result.downloaded_scenes) == 1
    assert provider.calls[0]["aoi_wkt"] == ingest_request.aoi_wkt
    assert provider.calls[0]["max_cloud_cover"] == 20.0


def test_ingestion_service_rejects_invalid_date_window(tmp_path, request: IngestionRequest) -> None:
    provider = FakeProvider()
    service = IngestionService(provider=provider, cache_dir=tmp_path)

    bad_request = replace(
        request,
        start_date=date(2024, 2, 1),
        end_date=date(2024, 1, 1),
    )

    with pytest.raises(ValueError, match="start_date"):
        service.ingest(bad_request)


def test_ingestion_service_rejects_cloud_cover_outside_range(tmp_path, request: IngestionRequest) -> None:
    provider = FakeProvider()
    service = IngestionService(provider=provider, cache_dir=tmp_path)

    bad_request = replace(request, max_cloud_cover=120.0)
    with pytest.raises(ValueError, match="max_cloud_cover"):
        service.ingest(bad_request)
