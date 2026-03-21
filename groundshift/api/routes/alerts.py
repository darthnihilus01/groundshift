from fastapi import APIRouter, HTTPException

from groundshift.api.models import Alert

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

alerts: list[Alert] = []


@router.get("", response_model=list[Alert])
async def list_alerts() -> list[Alert]:
    return sorted(alerts, key=lambda alert: alert.fired_at, reverse=True)


@router.get("/{alert_id}", response_model=Alert)
async def get_alert(alert_id: str) -> Alert:
    for alert in alerts:
        if alert.id == alert_id:
            return alert

    raise HTTPException(status_code=404, detail="Alert not found")
