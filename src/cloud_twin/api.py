import asyncio
import json
import time
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from src.utils import load_config, get_config_path, setup_logger
from src.cloud_twin.data_store import DataStore


logger = setup_logger("cloud.api")
store: DataStore = None
ws_clients: Set[WebSocket] = set()
_recent_messages: list = []
_message_buffer_size = 200


@asynccontextmanager
async def lifespan(app: FastAPI):
    global store
    config = load_config(get_config_path("cloud.yaml"))
    db_path = config.get("database", {}).get("path", "data/v2x_cloud.db")
    store = DataStore(db_path)
    logger.info("Cloud API started")
    yield
    logger.info("Cloud API shutdown")


app = FastAPI(title="V2X Cloud Twin API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── WebSocket ──────────────────────────────────────────────

@app.websocket("/api/v1/realtime/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    logger.info(f"WebSocket client connected, total: {len(ws_clients)}")
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("action") == "subscribe":
                pass  # All clients receive all messages for now
    except WebSocketDisconnect:
        ws_clients.discard(ws)
        logger.info(f"WebSocket client disconnected, total: {len(ws_clients)}")
    except Exception:
        ws_clients.discard(ws)


async def broadcast_to_clients(msg_type: str, data: dict):
    """Broadcast a message to all connected WebSocket clients."""
    message = json.dumps({"type": msg_type, "data": data, "timestamp": int(time.time() * 1000)})
    _recent_messages.append(message)
    if len(_recent_messages) > _message_buffer_size:
        _recent_messages.pop(0)

    disconnected = set()
    for ws in ws_clients:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.add(ws)
    ws_clients.difference_update(disconnected)


# ─── REST APIs ──────────────────────────────────────────────

@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "timestamp": int(time.time() * 1000), "clients": len(ws_clients)}


@app.get("/api/v1/frames/{frame_id}")
async def get_frame(frame_id: int):
    frame = store.get_frame(frame_id)
    if frame is None:
        return {"error": "Frame not found"}, 404
    return frame


@app.get("/api/v1/replay/{scene_id}")
async def get_replay(scene_id: str, start_ts: int = 0, end_ts: int = 0,
                     data_types: str = "perception,decision"):
    frames = store.get_frames_range(start_ts, end_ts, scene_id)
    return {
        "scene_id": scene_id,
        "start_ts": start_ts,
        "end_ts": end_ts,
        "total_frames": len(frames),
        "data": frames,
    }


@app.get("/api/v1/events")
async def get_events(scene_id: str = None, severity: str = None,
                     limit: int = Query(default=50, le=200),
                     offset: int = Query(default=0, ge=0)):
    total, events = store.get_events(scene_id, severity, limit, offset)
    return {"total": total, "events": events}


@app.get("/api/v1/events/{event_id}")
async def get_event_detail(event_id: str):
    result = store.get_event_replay(event_id)
    if result is None:
        return {"error": "Event not found"}, 404
    return result


@app.get("/api/v1/metrics")
async def get_metrics():
    return {
        "roadside": {
            "avg_fps": 10.0,
            "avg_inference_ms": 35.0,
            "avg_gpu_util": 45.0,
        },
        "communication": {
            "avg_latency_ms": 25.0,
            "message_loss_rate": 0.002,
            "uptime_percent": 99.5,
            "connected_clients": len(ws_clients),
        },
        "vehicle": {
            "avg_decision_ms": 12.0,
            "brake_events_count": 0,
            "fallback_count": 0,
        },
    }


@app.get("/api/v1/messages/recent")
async def get_recent_messages(limit: int = Query(default=50, le=200)):
    """Get recent MQTT messages buffered in memory."""
    messages = _recent_messages[-limit:]
    return {"messages": [json.loads(m) for m in messages]}
