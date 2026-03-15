"""
Vectorized Backtest Engine.

Simula trades generados por add_signals() sobre datos históricos.
Motor vectorizado con pandas — mucho más rápido que el loop barra a barra.
"""
from __future__ import annotations
import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import Optional

from strategy.signals import StrategyParams, add_signals, calc_position_size
import config


@dataclass
class Trade:
    id:         int
    direction:  str        # 'LONG' | 'SHORT'
    entry_date: str
    exit_date:  str
    entry:      float
    sl:         float
    tp:         float
    size:       float      # units
    pnl:        float      # €
    pnl_r:      float      # en R múltiplos
    result:     str        # 'WIN' | 'LOSS'
    mae:        float      # max adverse excursion (€)
    mfe:        float      # max favorable excursion (€)
    equity:     float      # equity tras el trade


@dataclass
class BacktestMetrics:
    # Performance
    total_return:    float
    cagr:            float
    final_equity:    float
    net_pnl:         float

    # Trades
    total_trades:    int
    wins:            int
    losses:          int
    win_rate:        float
    avg_win:         float
    avg_loss:        float
    avg_rr:          float
    profit_factor:   float

    # Risk
    max_drawdown:    float
    max_dd_duration: int       # days
    sharpe:          float
    sortino:         float
    calmar:          float
    total_costs:     float

    # Curves
    equity_curve:    list[dict]   # {date, equity, drawdown}
    by_year:         dict         # year → {trades, pnl, return_pct, win_rate}


@dataclass
class BacktestResult:
    trades:  list[Trade]
    metrics: BacktestMetrics
    params:  StrategyParams


# ── Score function ─────────────────────────────────────────────────────────────
# Orientada a quant: Calmar > Sharpe > PF > tamaño muestral
# Igual que la TS pero en Python

def calc_score(m: BacktestMetrics) -> float:
    if m.total_trades < 10 or m.max_drawdown >= 40:
        return 0.0
    calmar_n = min(m.calmar,        5.0) / 5.0
    sharpe_n = min(max(m.sharpe, 0), 3.0) / 3.0
    pf_n     = min(m.profit_factor, 3.0) / 3.0
    trade_b  = min(m.total_trades / 100, 1.0)
    return calmar_n * 0.40 + sharpe_n * 0.35 + pf_n * 0.15 + trade_b * 0.10


# ── Main backtest ─────────────────────────────────────────────────────────────

def run_backtest(
    df: pd.DataFrame,
    params: StrategyParams,
    initial_capital: float = 10_000.0,
) -> BacktestResult:
    """
    Ejecuta el backtest sobre el DataFrame (columnas: date, open, high, low, close).
    Entrada al cierre de la vela de señal (next bar: usamos el open de la siguiente
    para evitar look-ahead en la ejecución real).
    """
    df = add_signals(df, params)
    df = df.dropna().reset_index(drop=True)

    trades: list[Trade] = []
    equity    = initial_capital
    total_costs = 0.0
    trade_id  = 0
    in_trade  = False
    daily_pnl: dict[str, float] = {}
    consecutive_losses = 0

    bars_per_year = _estimate_bars_per_year(df)

    i = 0
    while i < len(df) - 1:
        row = df.iloc[i]

        if not in_trade and row["signal"] != 0:
            direction = "LONG" if row["signal"] == 1 else "SHORT"

            # Entry on next-bar open (no look-ahead)
            next_bar = df.iloc[i + 1]
            entry = next_bar["open"]
            sl    = row["sl_long"]  if direction == "LONG" else row["sl_short"]
            tp    = row["tp_long"]  if direction == "LONG" else row["tp_short"]
            atr   = row["atr"]

            risk_pts = abs(entry - sl)
            if risk_pts <= 0:
                i += 1
                continue

            size = calc_position_size(
                equity, atr, entry,
                params.target_vol_pct,
                bars_per_year,
                config.MAX_RISK_PCT_PER_TRADE,
            )
            if size <= 0:
                i += 1
                continue

            commission = params.commission
            total_costs += commission

            # Simulate bar-by-bar from entry bar
            result_type  = "LOSS"
            pnl          = -size * risk_pts
            exit_date    = next_bar["date"] if "date" in next_bar else str(next_bar.name)
            exit_price   = sl
            mae          = 0.0
            mfe          = 0.0

            for j in range(i + 1, min(len(df), i + 300)):
                bar = df.iloc[j]
                bar_date = bar["date"] if "date" in bar else str(bar.name)

                if direction == "LONG":
                    adv = (entry - bar["low"]) * size
                    fav = (bar["high"] - entry) * size
                    if adv > mae: mae = adv
                    if fav > mfe: mfe = fav

                    if bar["low"] <= sl:
                        result_type = "LOSS"
                        pnl = -size * risk_pts
                        exit_date = bar_date
                        exit_price = sl
                        break
                    if bar["high"] >= tp:
                        result_type = "WIN"
                        pnl = size * risk_pts * params.tp_rr
                        exit_date = bar_date
                        exit_price = tp
                        break
                else:
                    adv = (bar["high"] - entry) * size
                    fav = (entry - bar["low"]) * size
                    if adv > mae: mae = adv
                    if fav > mfe: mfe = fav

                    if bar["high"] >= sl:
                        result_type = "LOSS"
                        pnl = -size * risk_pts
                        exit_date = bar_date
                        exit_price = sl
                        break
                    if bar["low"] <= tp:
                        result_type = "WIN"
                        pnl = size * risk_pts * params.tp_rr
                        exit_date = bar_date
                        exit_price = tp
                        break

            pnl -= commission
            equity += pnl
            if equity <= 0:
                equity = 0.01

            pnl_r = pnl / (size * risk_pts) if (size * risk_pts) > 0 else 0.0

            entry_date = next_bar["date"] if "date" in next_bar else str(next_bar.name)
            date_key = entry_date[:10] if len(entry_date) >= 10 else entry_date
            daily_pnl[date_key] = daily_pnl.get(date_key, 0.0) + pnl

            trades.append(Trade(
                id=++trade_id + len(trades),
                direction=direction,
                entry_date=entry_date,
                exit_date=exit_date,
                entry=entry,
                sl=sl,
                tp=tp,
                size=size,
                pnl=pnl,
                pnl_r=pnl_r,
                result=result_type,
                mae=mae,
                mfe=mfe,
                equity=equity,
            ))

            i += 2  # skip the entry bar
            continue

        i += 1

    metrics = _calc_metrics(trades, initial_capital, total_costs)
    return BacktestResult(trades=trades, metrics=metrics, params=params)


# ── Metrics ───────────────────────────────────────────────────────────────────

def _calc_metrics(
    trades: list[Trade],
    initial_capital: float,
    total_costs: float,
) -> BacktestMetrics:
    empty = BacktestMetrics(
        total_return=0, cagr=0, final_equity=initial_capital, net_pnl=0,
        total_trades=0, wins=0, losses=0, win_rate=0,
        avg_win=0, avg_loss=0, avg_rr=0, profit_factor=0,
        max_drawdown=0, max_dd_duration=0,
        sharpe=0, sortino=0, calmar=0, total_costs=total_costs,
        equity_curve=[], by_year={},
    )
    if not trades:
        return empty

    wins_t   = [t for t in trades if t.result == "WIN"]
    losses_t = [t for t in trades if t.result == "LOSS"]

    gross_profit = sum(t.pnl for t in wins_t if t.pnl > 0)
    gross_loss   = abs(sum(t.pnl for t in losses_t if t.pnl < 0))
    pf           = gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)
    win_rate     = len(wins_t) / len(trades) * 100

    final_equity = trades[-1].equity
    net_pnl      = final_equity - initial_capital
    total_return = (net_pnl / initial_capital) * 100

    # CAGR
    try:
        first_dt = pd.to_datetime(trades[0].entry_date)
        last_dt  = pd.to_datetime(trades[-1].exit_date)
        years    = max((last_dt - first_dt).days / 365.25, 0.01)
    except Exception:
        years = 1.0
    cagr = ((final_equity / initial_capital) ** (1 / years) - 1) * 100

    # Drawdown
    peak = initial_capital
    max_dd = 0.0
    max_dd_dur = 0
    cur_dd_start = None
    equity_curve = [{"date": trades[0].entry_date, "equity": initial_capital, "drawdown": 0.0}]

    for t in trades:
        if t.equity > peak:
            peak = t.equity
            if cur_dd_start is not None:
                try:
                    dur = (pd.to_datetime(t.exit_date) - cur_dd_start).days
                    if dur > max_dd_dur: max_dd_dur = dur
                except Exception:
                    pass
                cur_dd_start = None
        dd = (peak - t.equity) / peak * 100 if peak > 0 else 0.0
        if dd > max_dd: max_dd = dd
        if dd > 0 and cur_dd_start is None:
            try: cur_dd_start = pd.to_datetime(t.exit_date)
            except Exception: pass
        equity_curve.append({"date": t.exit_date, "equity": t.equity, "drawdown": -dd})

    # Sharpe + Sortino
    returns = [t.pnl_r for t in trades]
    mean_r  = np.mean(returns)
    std_r   = np.std(returns)
    sharpe  = (mean_r / std_r) * np.sqrt(252) if std_r > 0 else 0.0

    downside = [r for r in returns if r < 0]
    down_std = np.sqrt(np.mean([r**2 for r in downside])) if downside else 0.0
    sortino  = (mean_r / down_std) * np.sqrt(252) if down_std > 0 else sharpe

    calmar = cagr / max_dd if max_dd > 0 else cagr

    avg_win  = np.mean([t.pnl for t in wins_t])   if wins_t   else 0.0
    avg_loss = np.mean([t.pnl for t in losses_t]) if losses_t else 0.0
    avg_rr   = np.mean(returns)

    # Yearly breakdown
    by_year: dict = {}
    for t in trades:
        try:
            y = pd.to_datetime(t.exit_date).year
        except Exception:
            continue
        if y not in by_year:
            by_year[y] = {"year": y, "trades": 0, "wins": 0, "pnl": 0.0, "win_rate": 0.0, "return_pct": 0.0}
        by_year[y]["trades"] += 1
        by_year[y]["pnl"]    += t.pnl
        if t.result == "WIN":
            by_year[y]["wins"] += 1
    for y, s in by_year.items():
        s["win_rate"]   = s["wins"] / s["trades"] * 100 if s["trades"] > 0 else 0
        s["return_pct"] = s["pnl"] / initial_capital * 100

    return BacktestMetrics(
        total_return=total_return, cagr=cagr,
        final_equity=final_equity, net_pnl=net_pnl,
        total_trades=len(trades), wins=len(wins_t), losses=len(losses_t),
        win_rate=win_rate, avg_win=avg_win, avg_loss=avg_loss, avg_rr=avg_rr,
        profit_factor=pf, max_drawdown=max_dd, max_dd_duration=max_dd_dur,
        sharpe=sharpe, sortino=sortino, calmar=calmar,
        total_costs=total_costs, equity_curve=equity_curve, by_year=by_year,
    )


# ── Multi-asset validation ────────────────────────────────────────────────────

def run_multi_asset(
    datasets: list[dict],   # [{symbol, df}]
    params: StrategyParams,
    initial_capital: float,
) -> dict:
    results = []
    for ds in datasets:
        if len(ds["df"]) < 300:
            continue
        r = run_backtest(ds["df"], params, initial_capital)
        results.append({
            "symbol":       ds["symbol"],
            "score":        calc_score(r.metrics),
            "trades":       r.metrics.total_trades,
            "win_rate":     r.metrics.win_rate,
            "profit_factor": r.metrics.profit_factor,
            "max_drawdown": r.metrics.max_drawdown,
            "sharpe":       r.metrics.sharpe,
            "cagr":         r.metrics.cagr,
        })

    if not results:
        return {"assets": [], "robustness": 0, "weighted_score": 0}

    consistent = [a for a in results if a["profit_factor"] > 1.0 and a["max_drawdown"] < 30]
    total_trades = sum(a["trades"] for a in results)
    weighted_score = (
        sum(a["score"] * a["trades"] for a in results) / total_trades
        if total_trades > 0 else 0.0
    )

    return {
        "assets":         results,
        "robustness":     len(consistent) / len(results) * 100,
        "consistent":     len(consistent),
        "total":          len(results),
        "weighted_score": weighted_score,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _estimate_bars_per_year(df: pd.DataFrame) -> int:
    """Estimate bars per year based on data frequency."""
    if len(df) < 2:
        return 252
    try:
        dates = pd.to_datetime(df["date"] if "date" in df.columns else df.index)
        delta = (dates.iloc[-1] - dates.iloc[0]).days
        if delta <= 0:
            return 252
        bars_per_day = len(df) / (delta / 365.25)
        return max(50, round(bars_per_day * 252))
    except Exception:
        return 252
