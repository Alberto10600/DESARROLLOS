"""
Trend Following Strategy — Donchian Breakout + ATR Stops + Volatility Targeting

Lo que usan los CTAs sistemáticos (AQR, Man AHL, Winton, etc.):
  1. Señal: rotura del canal Donchian (N-period high/low) — momentum probado 40+ años
  2. Filtro: EMA de tendencia opcional (reduce trades en ranging markets)
  3. Stop: 2 × ATR desde la entrada (stop dinámico basado en volatilidad)
  4. TP: R:R fijo o trailing ATR stop
  5. Sizing: Volatility Targeting — escalar inversamente a la vol reciente
             posición = (equity × target_vol%) / (ATR × √252)
             Mismo riesgo en términos de vol, no en % fijo
"""
from __future__ import annotations
from dataclasses import dataclass, field
import pandas as pd
import numpy as np


# ── Parameter set ─────────────────────────────────────────────────────────────
# Máximo 6 parámetros. Cada uno tiene justificación económica, no es data-mining.

@dataclass
class StrategyParams:
    breakout_period: int   = 20    # Canal Donchian: lookback N periodos
    atr_period:      int   = 14    # ATR: suavizado de volatilidad
    atr_sl_mult:     float = 2.0   # SL = entrada ± N × ATR
    tp_rr:           float = 3.0   # TP = entrada ± (SL_dist × RR)
    target_vol_pct:  float = 15.0  # Vol anualizada objetivo (%) para sizing
    ema_filter:      int   = 0     # EMA trend filter (0 = desactivado)

    # Costes reales
    slippage_pct:    float = 0.05  # % del precio por entrada/salida
    commission:      float = 2.0   # € fijos por trade


# ── Indicator helpers ─────────────────────────────────────────────────────────

def calc_atr(df: pd.DataFrame, period: int) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low  - close.shift(1)).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def calc_donchian(df: pd.DataFrame, period: int) -> tuple[pd.Series, pd.Series]:
    """Returns (dc_high, dc_low) — uses shift(1) to prevent look-ahead."""
    dc_high = df["high"].rolling(period).max().shift(1)
    dc_low  = df["low"].rolling(period).min().shift(1)
    return dc_high, dc_low


# ── Signal generation ─────────────────────────────────────────────────────────

def add_signals(df: pd.DataFrame, params: StrategyParams) -> pd.DataFrame:
    """
    Añade columnas de señal al DataFrame.
    Entrada al cierre de la vela de rotura, SL/TP calculados en base a ATR.
    """
    df = df.copy()

    df["atr"]    = calc_atr(df, params.atr_period)
    dc_high, dc_low = calc_donchian(df, params.breakout_period)
    df["dc_high"] = dc_high
    df["dc_low"]  = dc_low

    if params.ema_filter > 0:
        df["ema"] = df["close"].ewm(span=params.ema_filter, adjust=False).mean()
        long_trend  = df["close"] > df["ema"]
        short_trend = df["close"] < df["ema"]
    else:
        long_trend  = pd.Series(True, index=df.index)
        short_trend = pd.Series(True, index=df.index)

    # Breakout signal: precio cierra por encima/debajo del canal anterior
    long_signal  = (df["close"] > df["dc_high"]) & long_trend
    short_signal = (df["close"] < df["dc_low"])  & short_trend

    # Evitar señales consecutivas en el mismo lado (sin pausa)
    df["signal"] = 0
    df.loc[long_signal,  "signal"] =  1
    df.loc[short_signal, "signal"] = -1

    # Entry: precio de cierre de la vela de señal + slippage
    slippage = df["close"] * (params.slippage_pct / 100)
    df["entry_long"]  = df["close"] + slippage
    df["entry_short"] = df["close"] - slippage

    # SL based on ATR
    df["sl_dist"] = df["atr"] * params.atr_sl_mult
    df["sl_long"]  = df["entry_long"]  - df["sl_dist"]
    df["sl_short"] = df["entry_short"] + df["sl_dist"]

    # TP based on R:R
    df["tp_long"]  = df["entry_long"]  + df["sl_dist"] * params.tp_rr
    df["tp_short"] = df["entry_short"] - df["sl_dist"] * params.tp_rr

    return df


# ── Volatility-targeted position sizing ──────────────────────────────────────

def calc_position_size(
    equity: float,
    atr: float,
    price: float,
    target_vol_pct: float,
    bars_per_year: int = 252,
    max_risk_pct: float = 2.0,
) -> float:
    """
    Volatility targeting: size inversamente a la vol reciente.
    La lógica: queremos que cada dólar de notional genere la misma
    contribución de volatilidad al portfolio.

    size_units = (equity × target_vol) / (atr × √bars_per_year)

    Cap duro: no arriesgar más de max_risk_pct del equity por trade.
    """
    if atr <= 0 or price <= 0:
        return 0.0

    target_vol = target_vol_pct / 100
    size_vol = (equity * target_vol) / (atr * np.sqrt(bars_per_year))

    # Cap por riesgo máximo
    max_risk_units = (equity * max_risk_pct / 100) / atr
    size = min(size_vol, max_risk_units)

    return max(0.0, size)
