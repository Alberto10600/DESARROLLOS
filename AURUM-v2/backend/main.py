"""
AURUM v2 — FastAPI entry point.

En desarrollo: uvicorn main:app --reload --port 8765
En producción:  sirve también el frontend compilado desde /frontend/dist
"""
import logging, os
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

import config
from api.routes import router
from api.ws import ws_endpoint, emit

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("aurum-v2")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"AURUM v2 ready — http://{config.HOST}:{config.PORT}")
    await emit("info", "AURUM Engine v2 online")
    yield
    from broker.ibkr import broker
    broker.disconnect()
    logger.info("Shutdown complete")


app = FastAPI(title="AURUM v2", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await ws_endpoint(websocket)


# Serve React frontend in production
frontend_dir = os.path.join(os.path.dirname(__file__), config.FRONTEND)
if os.path.isdir(frontend_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        index = os.path.join(frontend_dir, "index.html")
        return FileResponse(index)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=True)
