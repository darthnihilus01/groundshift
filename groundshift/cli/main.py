from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Optional

import typer

from groundshift.core.ingestion.models import IngestionRequest
from groundshift.core.ingestion.providers.sentinelsat_provider import SentinelSatProvider
from groundshift.core.ingestion.service import IngestionService, parse_iso_date

app = typer.Typer(help="groundshift command line interface")


@app.command("ingest")
def ingest_command(
    aoi_wkt: str = typer.Option(..., help="AOI polygon as WKT in EPSG:4326"),
    start_date: str = typer.Option(..., help="Start date (YYYY-MM-DD)"),
    end_date: str = typer.Option(..., help="End date (YYYY-MM-DD)"),
    max_cloud_cover: float = typer.Option(20.0, min=0.0, max=100.0),
    limit: int = typer.Option(20, min=1),
    cache_dir: str = typer.Option(".groundshift/cache"),
    username: Optional[str] = typer.Option(None, envvar="COPERNICUS_USERNAME"),
    password: Optional[str] = typer.Option(None, envvar="COPERNICUS_PASSWORD"),
    api_url: Optional[str] = typer.Option(None, help="Override Copernicus API URL"),
    output_json: Optional[str] = typer.Option(None, help="Optional output JSON path"),
) -> None:
    """Query and download Sentinel-2 L2A scenes for an AOI and date window."""

    if not username or not password:
        raise typer.BadParameter(
            "Copernicus credentials are required. Set COPERNICUS_USERNAME and "
            "COPERNICUS_PASSWORD or pass --username/--password."
        )

    request = IngestionRequest(
        aoi_wkt=aoi_wkt,
        start_date=parse_iso_date(start_date),
        end_date=parse_iso_date(end_date),
        max_cloud_cover=max_cloud_cover,
        limit=limit,
    )

    provider = SentinelSatProvider(username=username, password=password, api_url=api_url)
    service = IngestionService(provider=provider, cache_dir=cache_dir)
    result = service.ingest(request)

    payload = asdict(result)
    rendered = json.dumps(payload, indent=2, default=str)

    if output_json:
        output_path = Path(output_json)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered, encoding="utf-8")
        typer.echo(f"Wrote ingestion result to {output_path}")
        return

    typer.echo(rendered)


if __name__ == "__main__":
    app()
