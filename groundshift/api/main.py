import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from groundshift.api.routes.alerts import router as alerts_router
from groundshift.api.routes.watches import router as watches_router
from groundshift.api.websocket import manager

app = FastAPI(title="groundshift API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(watches_router)
app.include_router(alerts_router)


@app.on_event("startup")
async def on_startup() -> None:
    logging.info("groundshift API ready")


@app.websocket("/ws/alerts")
async def alert_stream(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
