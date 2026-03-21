from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class WatchCreate(BaseModel):
    name: str
    aoi_wkt: str  # WKT polygon
    threshold: float = 0.3
    description: Optional[str] = None


class Watch(BaseModel):
    id: str
    name: str
    aoi_wkt: str
    threshold: float
    description: Optional[str]
    created_at: datetime
    active: bool = True


class Alert(BaseModel):
    id: str
    watch_id: str
    watch_name: str
    severity: str  # "critical", "moderate", "low"
    change_score: float
    location: str
    geojson_path: str
    probable_cause: str
    fired_at: datetime
    aoi_wkt: str


class AlertSummary(BaseModel):
    total_alerts: int
    critical: int  # change_score > 0.6
    moderate: int  # 0.3-0.6
    low: int  # < 0.3
