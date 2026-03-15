"""
WebSocket endpoint — real-time signal and trade event streaming.
MonitorPage subscribes to ws://localhost:8765/ws/signals
"""
import asyncio
import json
import logging
from typing import Set
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# Connected WebSocket clients
_clients: Set[WebSocket] = set()


async def ws_signals_endpoint(websocket: WebSocket):
    """Accepts WS connection and streams signal events."""
    await websocket.accept()
    _clients.add(websocket)
    logger.info(f"WS client connected: {websocket.client}")
    try:
        while True:
            # Keep connection alive — actual events are pushed via broadcast()
            await asyncio.sleep(30)
            await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    finally:
        _clients.discard(websocket)
        logger.info(f"WS client disconnected: {websocket.client}")


async def broadcast(message: dict):
    """Broadcast a message to all connected WS clients."""
    if not _clients:
        return
    dead = set()
    for ws in _clients:
        try:
            await ws.send_json(message)
        except Exception:
            dead.add(ws)
    _clients -= dead


async def emit_signal(direction: str, symbol: str, entry: float, sl: float, tp2: float, reason: str = ""):
    await broadcast({
        "type":      "signal",
        "message":   f"SIGNAL {direction} {symbol} @ {entry:.4f} | SL {sl:.4f} | TP2 {tp2:.4f} | {reason}",
        "direction": direction,
        "symbol":    symbol,
        "entry":     entry,
        "sl":        sl,
        "tp2":       tp2,
    })

async def emit_trade(event: str, symbol: str, pnl: float = 0.0):
    await broadcast({
        "type":    "trade",
        "message": f"TRADE {event} {symbol} PnL={pnl:+.2f}€",
        "event":   event,
        "symbol":  symbol,
        "pnl":     pnl,
    })

async def emit_info(msg: str):
    await broadcast({"type": "info", "message": msg})
