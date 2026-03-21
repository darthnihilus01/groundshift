from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from groundshift.api.models import Watch, WatchCreate

router = APIRouter(prefix="/api/watches", tags=["watches"])

watches: dict[str, Watch] = {}


@router.get("", response_model=list[Watch])
async def list_watches() -> list[Watch]:
    return list(watches.values())


@router.post("", response_model=Watch)
async def create_watch(payload: WatchCreate) -> Watch:
    watch = Watch(
        id=str(uuid4()),
        name=payload.name,
        aoi_wkt=payload.aoi_wkt,
        threshold=payload.threshold,
        description=payload.description,
        created_at=datetime.now(timezone.utc),
        active=True,
    )
    watches[watch.id] = watch
    return watch


@router.delete("/{watch_id}")
async def delete_watch(watch_id: str) -> dict[str, str]:
    if watch_id not in watches:
        raise HTTPException(status_code=404, detail="Watch not found")

    del watches[watch_id]
    return {"detail": "Watch deleted"}
