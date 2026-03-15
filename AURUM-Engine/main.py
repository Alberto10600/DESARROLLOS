"""
AURUM Engine — FastAPI entry point.

Usage:
    python main.py
    # or with uvicorn directly:
    uvicorn main:app --host 127.0.0.1 --port 8765 --reload

Communicates with the Electron UI on localhost only (never exposed to internet).
"""
import asyncio
import logging
import signal
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

import config
from api.routes import router
from api.ws import ws_signals_endpoint, emit_info

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("aurum-engine")


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"AURUM Engine starting on http://{config.HOST}:{config.PORT}")
    await emit_info("AURUM Engine online")
    yield
    logger.info("AURUM Engine shutting down")
    from broker.ibkr import broker
    broker.disconnect()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AURUM Engine",
    description="SMC Trading Bot — IBKR execution backend",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: only allow the Electron renderer (file:// or localhost origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Electron uses file:// origins, so wildcard needed locally
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routes
app.include_router(router)

# WebSocket
@app.websocket("/ws/signals")
async def ws_signals(websocket: WebSocket):
    await ws_signals_endpoint(websocket)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=config.HOST,
        port=config.PORT,
        reload=False,
        log_level="info",
    )
