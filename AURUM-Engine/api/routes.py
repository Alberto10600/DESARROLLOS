"""
AURUM Engine — REST API routes.
Called by the Electron UI (DeployPage / MonitorPage).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from broker.ibkr import broker
from strategy.risk import risk_manager
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Request models ────────────────────────────────────────────────────────────

class IbkrConnectRequest(BaseModel):
    host:      str   = "127.0.0.1"
    port:      int   = 7497
    clientId:  int   = 1
    accountId: str   = ""
    isPaper:   bool  = True

class DeployRequest(BaseModel):
    params:   dict
    symbol:   str
    interval: str
    capital:  float
    isPaper:  bool = True

# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "ok", "ibkr": broker.is_connected}

# ── IBKR ─────────────────────────────────────────────────────────────────────

@router.post("/ibkr/connect")
async def ibkr_connect(req: IbkrConnectRequest):
    result = await broker.connect(req.host, req.port, req.clientId, req.accountId)
    return result

@router.post("/ibkr/disconnect")
async def ibkr_disconnect():
    broker.disconnect()
    return {"status": "disconnected"}

@router.get("/ibkr/status")
async def ibkr_status():
    return {
        "connected": broker.is_connected,
        "account":   broker._account if broker.is_connected else "",
        "equity":    broker.get_account_value() if broker.is_connected else 0,
    }

# ── Positions ─────────────────────────────────────────────────────────────────

@router.get("/positions")
async def get_positions():
    return broker.get_positions()

@router.get("/status")
async def get_status():
    return {
        "daily_pnl":    risk_manager.daily_pnl,
        "daily_trades": risk_manager.daily_trades,
        "open_positions": risk_manager.open_positions,
    }

# ── Strategy deployment ───────────────────────────────────────────────────────

# Holds the currently deployed strategy config
_deployed_strategy: Optional[dict] = None

@router.post("/strategy/deploy")
async def deploy_strategy(req: DeployRequest):
    global _deployed_strategy
    if not broker.is_connected:
        raise HTTPException(400, "IBKR not connected")
    _deployed_strategy = req.dict()
    logger.info(f"Strategy deployed: {req.symbol} {req.interval} capital={req.capital}")
    return {"status": "deployed", "symbol": req.symbol}

@router.post("/strategy/stop")
async def stop_strategy():
    global _deployed_strategy
    _deployed_strategy = None
    broker.cancel_all_orders()
    return {"status": "stopped"}

@router.get("/strategy/status")
async def strategy_status():
    return {
        "deployed": _deployed_strategy is not None,
        "config": _deployed_strategy,
    }
