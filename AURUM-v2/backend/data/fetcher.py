"""
Data fetcher — IBKR historical data (primary) with yfinance fallback.
Returns clean pandas DataFrames with columns: date, open, high, low, close, volume.
"""
from __future__ import annotations
import pandas as pd
import numpy as np
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# yfinance ticker mapping (for fallback / development)
YF_SYMBOLS = {
    "XAU/USD": "GC=F",
    "BTC/USD": "BTC-USD",
    "EUR/USD": "EURUSD=X",
    "NAS100":  "NQ=F",
    "SPY":     "SPY",
    "ETH/USD": "ETH-USD",
    "AAPL":    "AAPL",
    "TSLA":    "TSLA",
    "GBP/USD": "GBPUSD=X",
    "USD/JPY": "USDJPY=X",
}

# IBKR interval → yfinance interval
YF_INTERVAL = {
    "1day":  "1d",
    "4h":    "1h",   # yfinance doesn't have 4h; use 1h and resample
    "1h":    "1h",
    "30min": "30m",
}


def fetch_candles(
    symbol: str,
    interval: str = "1day",
    start: str = "2018-01-01",
    source: str = "auto",        # "auto" | "yfinance" | "ibkr"
) -> tuple[pd.DataFrame, str]:
    """
    Returns (df, source_used) where source_used is 'ibkr' | 'yfinance' | 'demo'.
    df columns: date (str YYYY-MM-DD HH:MM), open, high, low, close, volume.
    """
    if source in ("auto", "ibkr"):
        try:
            from broker.ibkr import broker
            if broker.is_connected:
                df = _fetch_ibkr(symbol, interval, start)
                if df is not None and len(df) > 50:
                    return df, "ibkr"
        except Exception as e:
            logger.warning(f"IBKR data fetch failed: {e}")

    if source in ("auto", "yfinance"):
        try:
            df = _fetch_yfinance(symbol, interval, start)
            if df is not None and len(df) > 50:
                return df, "yfinance"
        except Exception as e:
            logger.warning(f"yfinance fetch failed: {e}")

    # Demo data fallback
    df = _generate_demo(symbol, interval, start)
    return df, "demo"


def _fetch_yfinance(symbol: str, interval: str, start: str) -> pd.DataFrame | None:
    try:
        import yfinance as yf
        ticker = YF_SYMBOLS.get(symbol, symbol)
        yf_interval = YF_INTERVAL.get(interval, "1d")
        period = "max" if interval == "1day" else "2y"

        raw = yf.download(ticker, start=start, interval=yf_interval,
                          progress=False, auto_adjust=True)
        if raw.empty:
            return None

        # Flatten MultiIndex columns if present
        if isinstance(raw.columns, pd.MultiIndex):
            raw.columns = raw.columns.get_level_values(0)

        raw = raw.rename(columns=str.lower)
        raw = raw[["open", "high", "low", "close", "volume"]].copy()
        raw = raw.dropna()
        raw.index = pd.to_datetime(raw.index)

        # Resample to 4h if needed
        if interval == "4h":
            raw = raw.resample("4h").agg({
                "open": "first", "high": "max",
                "low": "min", "close": "last", "volume": "sum"
            }).dropna()

        raw["date"] = raw.index.strftime("%Y-%m-%d %H:%M")
        raw = raw.reset_index(drop=True)
        return raw[["date", "open", "high", "low", "close", "volume"]]
    except Exception as e:
        logger.error(f"yfinance error: {e}")
        return None


def _fetch_ibkr(symbol: str, interval: str, start: str) -> pd.DataFrame | None:
    """Fetch historical bars from IBKR TWS."""
    try:
        from broker.ibkr import broker
        from ib_insync import Contract

        duration_map = {
            "1day": "5 Y", "4h": "2 Y", "1h": "1 Y", "30min": "6 M"
        }
        bar_size_map = {
            "1day": "1 day", "4h": "4 hours", "1h": "1 hour", "30min": "30 mins"
        }

        c = Contract()
        c.symbol   = symbol.split("/")[0]
        c.secType  = "CMDTY" if "/" in symbol else "STK"
        c.currency = symbol.split("/")[-1] if "/" in symbol else "USD"
        c.exchange  = "SMART"

        bars = broker.ib.reqHistoricalData(
            c,
            endDateTime="",
            durationStr=duration_map.get(interval, "5 Y"),
            barSizeSetting=bar_size_map.get(interval, "1 day"),
            whatToShow="MIDPOINT",
            useRTH=True,
        )
        if not bars:
            return None

        df = pd.DataFrame([{
            "date":   str(b.date),
            "open":   b.open,
            "high":   b.high,
            "low":    b.low,
            "close":  b.close,
            "volume": b.volume,
        } for b in bars])
        return df
    except Exception as e:
        logger.error(f"IBKR historical data error: {e}")
        return None


def _generate_demo(symbol: str, interval: str, start: str) -> pd.DataFrame:
    """Generates realistic synthetic price data for development."""
    logger.info(f"Generating demo data for {symbol} {interval}")

    start_dt = pd.to_datetime(start)
    end_dt   = pd.Timestamp.now()

    freq_map = {"1day": "B", "4h": "4h", "1h": "1h", "30min": "30min"}
    freq     = freq_map.get(interval, "B")

    idx = pd.date_range(start=start_dt, end=end_dt, freq=freq)
    idx = idx[idx.dayofweek < 5]  # skip weekends for business days

    n = len(idx)

    # Base price by symbol
    base = {"XAU/USD": 1800, "BTC/USD": 30000, "EUR/USD": 1.10,
            "NAS100": 14000, "SPY": 400}.get(symbol, 100)

    # Random walk with drift + occasional regime changes
    rng    = np.random.default_rng(42)
    vol    = base * 0.01
    drift  = 0.0002
    prices = [base]
    for _ in range(n - 1):
        prices.append(max(prices[-1] * (1 + drift + rng.normal(0, vol / base)), base * 0.3))

    close  = np.array(prices)
    noise  = rng.uniform(0.0005, 0.003, n)
    high   = close * (1 + noise)
    low    = close * (1 - noise)
    open_  = np.roll(close, 1)
    open_[0] = close[0]
    volume = rng.integers(1000, 50000, n).astype(float)

    df = pd.DataFrame({
        "date":   idx.strftime("%Y-%m-%d %H:%M"),
        "open":   np.round(open_,  5),
        "high":   np.round(high,   5),
        "low":    np.round(low,    5),
        "close":  np.round(close,  5),
        "volume": volume,
    })
    return df
