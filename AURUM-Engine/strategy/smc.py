"""
SMC Strategy — Python port of the TypeScript engine.
Generates live signals from real-time OHLCV data.

This is the execution layer — runs the same logic as the backtested strategy
to ensure what you backtested is what you trade.
"""
from dataclasses import dataclass, field
from typing import Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class Candle:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    timestamp: float = 0.0


@dataclass
class Signal:
    direction: str       # 'LONG' | 'SHORT'
    entry: float
    sl: float
    tp1: float
    tp2: float
    ob_high: float
    ob_low: float
    candle_index: int
    reason: str = ""


@dataclass
class StrategyParams:
    swing_lookback: int   = 12
    ob_lookback: int      = 8
    tp1_rr: float         = 1.5
    tp2_rr: float         = 3.0
    sl_buffer: float      = 1.0
    ob_min_body_ratio: float = 0.35
    check_mitigation: bool = True
    require_fvg: bool     = False
    min_sweep_ext_pct: float = 0.0
    min_risk_reward: float   = 1.0
    slippage: float       = 0.0
    commission: float     = 0.0


def _ema(candles: list[Candle], period: int, end_idx: int) -> float:
    if end_idx < period:
        return candles[end_idx].close
    k = 2.0 / (period + 1)
    ema = candles[end_idx - period + 1].close
    for i in range(end_idx - period + 2, end_idx + 1):
        ema = candles[i].close * k + ema * (1 - k)
    return ema


def _ob_body_ratio(c: Candle) -> float:
    r = c.high - c.low
    return abs(c.close - c.open) / r if r > 0 else 0.0


def _is_ob_mitigated(
    candles: list[Candle],
    ob_idx: int,
    sweep_idx: int,
    direction: str,
    ob_high: float,
    ob_low: float,
) -> bool:
    for i in range(ob_idx + 1, sweep_idx):
        if i >= len(candles):
            break
        if direction == "SHORT" and candles[i].high >= ob_high:
            return True
        if direction == "LONG"  and candles[i].low  <= ob_low:
            return True
    return False


def _has_fvg(candles: list[Candle], from_idx: int, to_idx: int, direction: str) -> bool:
    for i in range(from_idx, to_idx - 1):
        if i < 0 or i + 2 >= len(candles):
            continue
        if direction == "LONG"  and candles[i].high < candles[i + 2].low:
            return True
        if direction == "SHORT" and candles[i].low  > candles[i + 2].high:
            return True
    return False


def detect_signal(candles: list[Candle], params: StrategyParams) -> Optional[Signal]:
    """
    Runs the SMC detection on the latest candles and returns a signal
    if a valid setup is present on the most recent complete candle.

    Designed for live use: called once per new candle close.
    Returns None if no setup found.
    """
    n = len(candles)
    min_period = max(params.swing_lookback, params.ob_lookback, 200) + 5
    if n < min_period + 3:
        return None

    # Check the most recent completed candle (n-2, as n-1 may be forming)
    i = n - 2

    # ── Swing High/Low ────────────────────────────────────────────────────────
    swing_high = max(candles[j].high for j in range(i - params.swing_lookback, i))
    swing_low  = min(candles[j].low  for j in range(i - params.swing_lookback, i))
    swing_high_idx = max(range(i - params.swing_lookback, i), key=lambda j: candles[j].high)
    swing_low_idx  = min(range(i - params.swing_lookback, i), key=lambda j: candles[j].low)

    c = candles[i]

    # ── SHORT setup: bearish sweep ─────────────────────────────────────────
    if c.high > swing_high and c.close < swing_high and i > swing_high_idx:
        if params.min_sweep_ext_pct > 0:
            ext_pct = (c.high - swing_high) / swing_high * 100
            if ext_pct < params.min_sweep_ext_pct:
                return None

        # Find Order Block
        ob_idx = -1
        for k in range(i - 1, max(0, i - params.ob_lookback) - 1, -1):
            if candles[k].close > candles[k].open and _ob_body_ratio(candles[k]) >= params.ob_min_body_ratio:
                ob_idx = k
                break
        if ob_idx < 0:
            return None

        ob = candles[ob_idx]

        if params.check_mitigation and _is_ob_mitigated(candles, ob_idx, i, "SHORT", ob.high, ob.low):
            return None
        if params.require_fvg and not _has_fvg(candles, ob_idx, i, "SHORT"):
            return None

        sl   = ob.high + params.sl_buffer
        risk = sl - ob.low
        if risk <= 0:
            return None

        tp1 = ob.low - risk * params.tp1_rr
        tp2 = ob.low - risk * params.tp2_rr
        rr  = (ob.low - tp2) / risk
        if rr < params.min_risk_reward:
            return None

        logger.info(f"SHORT signal: entry={ob.low:.4f} sl={sl:.4f} tp1={tp1:.4f} tp2={tp2:.4f}")
        return Signal(
            direction="SHORT", entry=ob.low, sl=sl, tp1=tp1, tp2=tp2,
            ob_high=ob.high, ob_low=ob.low, candle_index=i,
            reason=f"Bearish sweep of {swing_high:.4f}, OB at [{ob.low:.4f}-{ob.high:.4f}]",
        )

    # ── LONG setup: bullish sweep ──────────────────────────────────────────
    if c.low < swing_low and c.close > swing_low and i > swing_low_idx:
        if params.min_sweep_ext_pct > 0:
            ext_pct = (swing_low - c.low) / swing_low * 100
            if ext_pct < params.min_sweep_ext_pct:
                return None

        ob_idx = -1
        for k in range(i - 1, max(0, i - params.ob_lookback) - 1, -1):
            if candles[k].close < candles[k].open and _ob_body_ratio(candles[k]) >= params.ob_min_body_ratio:
                ob_idx = k
                break
        if ob_idx < 0:
            return None

        ob = candles[ob_idx]

        if params.check_mitigation and _is_ob_mitigated(candles, ob_idx, i, "LONG", ob.high, ob.low):
            return None
        if params.require_fvg and not _has_fvg(candles, ob_idx, i, "LONG"):
            return None

        sl   = ob.low - params.sl_buffer
        risk = ob.high - sl
        if risk <= 0:
            return None

        tp1 = ob.high + risk * params.tp1_rr
        tp2 = ob.high + risk * params.tp2_rr
        rr  = (tp2 - ob.high) / risk
        if rr < params.min_risk_reward:
            return None

        logger.info(f"LONG signal: entry={ob.high:.4f} sl={sl:.4f} tp1={tp1:.4f} tp2={tp2:.4f}")
        return Signal(
            direction="LONG", entry=ob.high, sl=sl, tp1=tp1, tp2=tp2,
            ob_high=ob.high, ob_low=ob.low, candle_index=i,
            reason=f"Bullish sweep of {swing_low:.4f}, OB at [{ob.low:.4f}-{ob.high:.4f}]",
        )

    return None
