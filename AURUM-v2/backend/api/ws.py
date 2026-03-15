"""WebSocket — streaming de señales y estado en tiempo real al frontend."""
import asyncio, json, logging
from typing import Set
from fastapi import WebSocket, WebSocketDisconnect

logger  = logging.getLogger(__name__)
_clients: Set[WebSocket] = set()


async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    _clients.add(websocket)
    try:
        while True:
            await asyncio.sleep(20)
            await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    finally:
        _clients.discard(websocket)


async def broadcast(msg: dict):
    dead = set()
    for ws in set(_clients):
        try:
            await ws.send_json(msg)
        except Exception:
            dead.add(ws)
    _clients -= dead


async def emit(type_: str, message: str, **extra):
    await broadcast({"type": type_, "message": message, **extra})
