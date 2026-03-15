"""REST API — endpoints llamados por el frontend React."""
from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from data.fetcher import fetch_candles
from strategy.signals import StrategyParams
from strategy.backtest import run_backtest, run_multi_asset, calc_score
from broker.ibkr import broker
import config

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Pydantic models ──────────────────────────────────────────────────────────

class ParamsIn(BaseModel):
    breakout_period: int   = 20
    atr_period:      int   = 14
    atr_sl_mult:     float = 2.0
    tp_rr:           float = 3.0
    target_vol_pct:  float = 15.0
    ema_filter:      int   = 0
    slippage_pct:    float = 0.05
    commission:      float = 2.0

class BacktestRequest(BaseModel):
    symbol:   str   = "XAU/USD"
    interval: str   = "1day"
    start:    str   = "2018-01-01"
    capital:  float = 10_000.0
    params:   ParamsIn = Field(default_factory=ParamsIn)

class MultiAssetRequest(BaseModel):
    symbols:  list[str] = ["XAU/USD", "BTC/USD", "EUR/USD", "NAS100"]
    interval: str   = "1day"
    start:    str   = "2018-01-01"
    capital:  float = 10_000.0
    params:   ParamsIn = Field(default_factory=ParamsIn)

class IbkrConnectIn(BaseModel):
    host:      str  = "127.0.0.1"
    port:      int  = 7497
    client_id: int  = 1
    account:   str  = ""
    is_paper:  bool = True

class DeployIn(BaseModel):
    symbol:   str
    interval: str
    capital:  float
    params:   ParamsIn
    is_paper: bool = True


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
def health():
    return {"status": "ok", "ibkr": broker.is_connected}


# ── Data ─────────────────────────────────────────────────────────────────────

@router.get("/data/candles")
def get_candles(symbol: str = "XAU/USD", interval: str = "1day", start: str = "2018-01-01"):
    df, source = fetch_candles(symbol, interval, start)
    return {
        "symbol":   symbol,
        "interval": interval,
        "source":   source,
        "count":    len(df),
        "candles":  df.to_dict(orient="records"),
    }


# ── Backtest ─────────────────────────────────────────────────────────────────

@router.post("/backtest/run")
def post_backtest(req: BacktestRequest):
    df, source = fetch_candles(req.symbol, req.interval, req.start)
    if len(df) < 100:
        raise HTTPException(400, f"Not enough data: {len(df)} candles")

    params = StrategyParams(**req.params.dict())
    result = run_backtest(df, params, req.capital)
    m      = result.metrics
    score  = calc_score(m)

    return {
        "source":  source,
        "score":   round(score, 4),
        "metrics": {
            "total_return":   round(m.total_return,   2),
            "cagr":           round(m.cagr,           2),
            "final_equity":   round(m.final_equity,   2),
            "net_pnl":        round(m.net_pnl,        2),
            "total_trades":   m.total_trades,
            "wins":           m.wins,
            "losses":         m.losses,
            "win_rate":       round(m.win_rate,       2),
            "avg_win":        round(m.avg_win,        2),
            "avg_loss":       round(m.avg_loss,       2),
            "avg_rr":         round(m.avg_rr,         3),
            "profit_factor":  round(m.profit_factor,  3),
            "max_drawdown":   round(m.max_drawdown,   2),
            "max_dd_duration": m.max_dd_duration,
            "sharpe":         round(m.sharpe,         3),
            "sortino":        round(m.sortino,        3),
            "calmar":         round(m.calmar,         3),
            "total_costs":    round(m.total_costs,    2),
            "equity_curve":   m.equity_curve,
            "by_year":        m.by_year,
        },
        "trades": [{
            "id":         t.id,
            "direction":  t.direction,
            "entry_date": t.entry_date,
            "exit_date":  t.exit_date,
            "entry":      round(t.entry,  5),
            "sl":         round(t.sl,     5),
            "tp":         round(t.tp,     5),
            "pnl":        round(t.pnl,    2),
            "pnl_r":      round(t.pnl_r,  3),
            "result":     t.result,
            "mae":        round(t.mae,    2),
            "mfe":        round(t.mfe,    2),
            "equity":     round(t.equity, 2),
        } for t in result.trades],
    }


# ── Multi-asset ───────────────────────────────────────────────────────────────

@router.post("/backtest/multi-asset")
def post_multi_asset(req: MultiAssetRequest):
    params = StrategyParams(**req.params.dict())
    datasets = []
    for sym in req.symbols:
        try:
            df, _ = fetch_candles(sym, req.interval, req.start)
            if len(df) >= 100:
                datasets.append({"symbol": sym, "df": df})
        except Exception:
            continue
    if not datasets:
        raise HTTPException(400, "No valid datasets")
    return run_multi_asset(datasets, params, req.capital)


# ── IBKR ─────────────────────────────────────────────────────────────────────

@router.post("/ibkr/connect")
async def ibkr_connect(req: IbkrConnectIn):
    return await broker.connect(req.host, req.port, req.client_id, req.account)

@router.post("/ibkr/disconnect")
def ibkr_disconnect():
    broker.disconnect()
    return {"status": "disconnected"}

@router.get("/ibkr/status")
def ibkr_status():
    return {
        "connected": broker.is_connected,
        "account":   broker._account,
        "equity":    broker.get_equity() if broker.is_connected else 0,
    }

@router.get("/ibkr/positions")
def ibkr_positions():
    return broker.get_positions()


# ── Strategy deploy ───────────────────────────────────────────────────────────

_active_strategy: Optional[dict] = None

@router.post("/strategy/deploy")
def deploy(req: DeployIn):
    global _active_strategy
    if not broker.is_connected:
        raise HTTPException(400, "IBKR not connected")
    _active_strategy = req.dict()
    logger.info(f"Strategy deployed: {req.symbol} {req.interval}")
    return {"status": "deployed"}

@router.post("/strategy/stop")
def stop():
    global _active_strategy
    _active_strategy = None
    return {"status": "stopped"}

@router.get("/strategy/status")
def strategy_status():
    return {"deployed": _active_strategy is not None, "config": _active_strategy}
