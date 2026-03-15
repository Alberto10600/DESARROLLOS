/**
 * Backtest Engine
 * Simula trades generados por el SMC Engine sobre datos históricos.
 * Soporta compounding, TP1/TP2, trailing stop y métricas completas.
 */

import type {
  Candle,
  StrategyParams,
  Trade,
  BacktestMetrics,
  BacktestResult,
  YearlyStats,
} from '../types'
import { detectSignals } from './smcStrategy'

// ─── Score ────────────────────────────────────────────────────────────────────

export function calcScore(m: BacktestMetrics): number {
  if (m.totalTrades < 5) return 0
  const dd = Math.min(m.maxDrawdown, 100)
  return (
    m.profitFactor *
    (m.winRate / 100) *
    (1 - dd / 100) *
    (m.totalReturn / 100)
  )
}

// ─── Backtest ─────────────────────────────────────────────────────────────────

export function runBacktest(
  candles: Candle[],
  params: StrategyParams,
  initialCapital: number
): BacktestResult {
  const {
    riskPct,
    tp1RR = 1.5,
    tp2RR,
    slBuffer,
    compounding = true,
    maxDailyLoss = 100,
    maxConsecutiveLosses = 99,
    trailingStop = false,
    trailingFactor = 1,
    breakEven = false,
  } = params

  const signals = detectSignals(candles, params)

  const trades: Trade[] = []
  let equity = initialCapital
  let tradeId = 0
  let consecutiveLosses = 0
  const dailyPnL: Record<string, number> = {}

  // ── Simular cada señal ──────────────────────────────────────────────────────
  for (const sig of signals) {
    if (sig.index >= candles.length) continue

    // Control de pérdida diaria
    const sigDate = candles[sig.index]?.date?.slice(0, 10) ?? ''
    if (maxDailyLoss < 100) {
      const dayLoss = dailyPnL[sigDate] ?? 0
      if (dayLoss <= -(equity * maxDailyLoss / 100)) continue
    }
    if (consecutiveLosses >= maxConsecutiveLosses) {
      consecutiveLosses = 0  // reset tras el bloqueo
      continue
    }

    const risk   = equity * (riskPct / 100)
    const riskPts = Math.abs(sig.entry - sig.sl)
    if (riskPts <= 0) continue

    const sizeEur = risk  // € en riesgo = position size en este modelo simplificado
    const sizeUnits = sizeEur / riskPts

    const tp1 = sig.direction === 'LONG'
      ? sig.entry + riskPts * tp1RR
      : sig.entry - riskPts * tp1RR

    const tp2 = sig.direction === 'LONG'
      ? sig.entry + riskPts * tp2RR
      : sig.entry - riskPts * tp2RR

    // Simular precio vela a vela desde la señal
    let result: 'WIN' | 'LOSS' | 'PARTIAL' = 'LOSS'
    let pnl = -sizeEur       // default: SL hit
    let pnlR = -1
    let mae = 0
    let mfe = 0
    let exitDate = candles[sig.index].date
    let currentSl = sig.sl

    let tp1Hit = false

    for (let k = sig.index; k < Math.min(candles.length, sig.index + 200); k++) {
      const bar = candles[k]
      exitDate = bar.date

      if (sig.direction === 'LONG') {
        const adverse = sig.entry - bar.low
        if (adverse > mae) mae = adverse
        const favorable = bar.high - sig.entry
        if (favorable > mfe) mfe = favorable

        // Trailing stop tras TP1
        if (tp1Hit && trailingStop) {
          const trailLevel = bar.high - riskPts * trailingFactor
          if (trailLevel > currentSl) currentSl = trailLevel
        }

        if (!tp1Hit && bar.high >= tp1) {
          tp1Hit = true
          pnl += sizeEur * 0.5 * tp1RR   // cerrar 50% en TP1
          pnl += sizeEur * 0.5            // recuperar el riesgo de esa mitad
          // Break-even: mover SL a entry tras TP1
          if (breakEven && sig.entry > currentSl) currentSl = sig.entry
        }

        if (bar.low <= currentSl) {
          if (tp1Hit) {
            result = 'PARTIAL'
            // segunda mitad golpea SL (o trailing SL)
            const slPnlPts = currentSl - sig.entry
            pnl += sizeUnits * 0.5 * slPnlPts
          } else {
            result = 'LOSS'
            pnl = -sizeEur
          }
          pnlR = pnl / sizeEur
          break
        }

        if (bar.high >= tp2) {
          result = 'WIN'
          pnl = sizeEur * tp1RR * 0.5 + sizeEur * tp2RR * 0.5
          pnlR = tp2RR
          break
        }
      } else {
        // SHORT
        const adverse = bar.high - sig.entry
        if (adverse > mae) mae = adverse
        const favorable = sig.entry - bar.low
        if (favorable > mfe) mfe = favorable

        if (tp1Hit && trailingStop) {
          const trailLevel = bar.low + riskPts * trailingFactor
          if (trailLevel < currentSl) currentSl = trailLevel
        }

        if (!tp1Hit && bar.low <= tp1) {
          tp1Hit = true
          pnl += sizeEur * 0.5 * tp1RR
          pnl += sizeEur * 0.5
          // Break-even: mover SL a entry tras TP1
          if (breakEven && sig.entry < currentSl) currentSl = sig.entry
        }

        if (bar.high >= currentSl) {
          if (tp1Hit) {
            result = 'PARTIAL'
            const slPnlPts = sig.entry - currentSl
            pnl += sizeUnits * 0.5 * slPnlPts
          } else {
            result = 'LOSS'
            pnl = -sizeEur
          }
          pnlR = pnl / sizeEur
          break
        }

        if (bar.low <= tp2) {
          result = 'WIN'
          pnl = sizeEur * tp1RR * 0.5 + sizeEur * tp2RR * 0.5
          pnlR = tp2RR
          break
        }
      }
    }

    // Actualizar equity
    if (compounding) {
      equity += pnl
    } else {
      equity = initialCapital + trades.reduce((s, t) => s + t.pnl, 0) + pnl
    }
    if (equity <= 0) equity = 0.01

    // Rastrear pérdidas consecutivas
    if (result === 'LOSS') { consecutiveLosses++ } else { consecutiveLosses = 0 }

    // Rastrear P&L diario
    dailyPnL[sigDate] = (dailyPnL[sigDate] ?? 0) + pnl

    const year = new Date(exitDate).getFullYear()

    trades.push({
      id: ++tradeId,
      date: exitDate,
      year,
      direction: sig.direction,
      result,
      entry: sig.entry,
      sl: sig.sl,
      tp1,
      tp2,
      pnl,
      pnlR,
      equity,
      mae,
      mfe,
    })
  }

  const metrics = calcMetrics(trades, initialCapital, candles)
  return { trades, metrics, params }
}

// ─── Métricas ─────────────────────────────────────────────────────────────────

function calcMetrics(
  trades: Trade[],
  initialCapital: number,
  candles: Candle[]
): BacktestMetrics {
  if (trades.length === 0) {
    return emptyMetrics(initialCapital)
  }

  const wins     = trades.filter(t => t.result === 'WIN')
  const losses   = trades.filter(t => t.result === 'LOSS')
  const partials = trades.filter(t => t.result === 'PARTIAL')

  const grossProfit = wins.concat(partials)
    .filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(
    losses.concat(partials).filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0)
  )

  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0
  const winRate = (wins.length + partials.length) / trades.length * 100
  const finalEquity = trades[trades.length - 1].equity
  const netPnL = finalEquity - initialCapital
  const totalReturn = (netPnL / initialCapital) * 100
  const avgWin  = wins.length   ? wins.reduce((s, t) => s + t.pnl, 0)   / wins.length   : 0
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0
  const avgRR   = trades.reduce((s, t) => s + t.pnlR, 0) / trades.length

  // ── CAGR ─────────────────────────────────────────────────────────────────────
  const firstDate = new Date(trades[0].date).getTime()
  const lastDate  = new Date(trades[trades.length - 1].date).getTime()
  const years = (lastDate - firstDate) / (365.25 * 86400 * 1000)
  const cagr = years > 0
    ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100
    : totalReturn

  // ── Drawdown ──────────────────────────────────────────────────────────────────
  let peak = initialCapital
  let maxDD = 0
  let ddStart = 0
  let maxDDDur = 0
  let curDDStart = 0
  let inDD = false

  const equityCurve: { date: string; equity: number; drawdown: number }[] = [
    { date: trades[0].date, equity: initialCapital, drawdown: 0 }
  ]

  for (const t of trades) {
    if (t.equity > peak) {
      peak = t.equity
      if (inDD) {
        const dur = new Date(t.date).getTime() - curDDStart
        if (dur > maxDDDur) maxDDDur = dur
        inDD = false
      }
    }
    const dd = peak > 0 ? (peak - t.equity) / peak * 100 : 0
    if (dd > maxDD) maxDD = dd
    if (dd > 0 && !inDD) { inDD = true; curDDStart = new Date(t.date).getTime() }
    equityCurve.push({ date: t.date, equity: t.equity, drawdown: -dd })
  }
  if (inDD) {
    const dur = new Date(trades[trades.length - 1].date).getTime() - curDDStart
    if (dur > maxDDDur) maxDDDur = dur
  }

  const maxDDDays = Math.round(maxDDDur / 86400 / 1000)

  // ── Sharpe ───────────────────────────────────────────────────────────────────
  const returns = trades.map(t => t.pnlR)
  const meanR = returns.reduce((s, r) => s + r, 0) / returns.length
  const stdR  = Math.sqrt(returns.map(r => (r - meanR) ** 2).reduce((s, v) => s + v, 0) / returns.length)
  const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0

  const calmar = maxDD > 0 ? cagr / maxDD : cagr

  // ── Yearly breakdown ──────────────────────────────────────────────────────────
  const byYear: Record<number, YearlyStats> = {}
  for (const t of trades) {
    if (!byYear[t.year]) {
      byYear[t.year] = {
        year: t.year,
        trades: 0, wins: 0, losses: 0, partials: 0,
        winRate: 0, pnl: 0, returnPct: 0,
        startEquity: t.equity - t.pnl,
        endEquity: t.equity,
        maxDrawdown: 0,
      }
    }
    const y = byYear[t.year]
    y.trades++
    y.pnl += t.pnl
    y.endEquity = t.equity
    if (t.result === 'WIN') y.wins++
    else if (t.result === 'LOSS') y.losses++
    else y.partials++
  }
  for (const y of Object.values(byYear)) {
    y.winRate = ((y.wins + y.partials) / y.trades) * 100
    y.returnPct = ((y.endEquity - y.startEquity) / y.startEquity) * 100
  }

  return {
    totalReturn,
    cagr,
    finalEquity,
    netPnL,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    partials: partials.length,
    winRate,
    avgWin,
    avgLoss,
    avgRR,
    profitFactor,
    maxDrawdown: maxDD,
    maxDrawdownDuration: maxDDDays,
    sharpeRatio: sharpe,
    calmarRatio: calmar,
    byYear,
    equityCurve,
  }
}

function emptyMetrics(cap: number): BacktestMetrics {
  return {
    totalReturn: 0, cagr: 0, finalEquity: cap, netPnL: 0,
    totalTrades: 0, wins: 0, losses: 0, partials: 0,
    winRate: 0, avgWin: 0, avgLoss: 0, avgRR: 0,
    profitFactor: 0, maxDrawdown: 0, maxDrawdownDuration: 0,
    sharpeRatio: 0, calmarRatio: 0, byYear: {}, equityCurve: []
  }
}

// ─── Monte Carlo Analysis ──────────────────────────────────────────────────────

export interface MonteCarloResult {
  simulations: number
  p5FinalEquity: number      // percentil 5 (peor caso realista)
  p25FinalEquity: number
  p50FinalEquity: number     // mediana
  p75FinalEquity: number
  p95FinalEquity: number     // mejor caso realista
  p5MaxDrawdown: number      // percentil 95 del drawdown (peor)
  p50MaxDrawdown: number
  p5Return: number           // retorno en percentil 5
  p50Return: number
  p95Return: number
  ruinProbability: number    // prob de perder > 50% del capital
  bandUpper: number[]        // banda superior de equity (p75)
  bandMedian: number[]       // mediana de equity
  bandLower: number[]        // banda inferior de equity (p25)
}

/**
 * Permuta aleatoriamente el orden de los trades N veces y mide la distribución
 * de outcomes posibles. Mide robustez de la equity curve.
 */
export function runMonteCarlo(
  trades: Trade[],
  initialCapital: number,
  simulations = 500
): MonteCarloResult {
  if (trades.length < 5) {
    return {
      simulations: 0,
      p5FinalEquity: initialCapital, p25FinalEquity: initialCapital,
      p50FinalEquity: initialCapital, p75FinalEquity: initialCapital,
      p95FinalEquity: initialCapital, p5MaxDrawdown: 0, p50MaxDrawdown: 0,
      p5Return: 0, p50Return: 0, p95Return: 0, ruinProbability: 0,
      bandUpper: [], bandMedian: [], bandLower: [],
    }
  }

  const pnls = trades.map(t => t.pnl)
  const finalEquities: number[] = []
  const maxDrawdowns: number[] = []

  // Para las bandas: guardar curvas de equity normalizadas
  const equityCurves: number[][] = []

  for (let s = 0; s < simulations; s++) {
    // Fisher-Yates shuffle de los P&Ls
    const shuffled = [...pnls]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    // Simular equity curve
    let eq = initialCapital
    let peak = initialCapital
    let maxDD = 0
    const curve: number[] = [eq]

    for (const pnl of shuffled) {
      eq = Math.max(0.01, eq + pnl)
      if (eq > peak) peak = eq
      const dd = peak > 0 ? (peak - eq) / peak * 100 : 0
      if (dd > maxDD) maxDD = dd
      curve.push(eq)
    }

    finalEquities.push(eq)
    maxDrawdowns.push(maxDD)
    equityCurves.push(curve)
  }

  finalEquities.sort((a, b) => a - b)
  maxDrawdowns.sort((a, b) => a - b)

  const pct = (arr: number[], p: number) => arr[Math.floor(arr.length * p)]

  // Bandas de equity (p25, p50, p75) sobre el tiempo
  const steps = trades.length + 1
  const bandUpper:  number[] = []
  const bandMedian: number[] = []
  const bandLower:  number[] = []

  for (let t = 0; t < steps; t++) {
    const vals = equityCurves.map(c => c[Math.min(t, c.length - 1)]).sort((a, b) => a - b)
    bandUpper.push(pct(vals, 0.75))
    bandMedian.push(pct(vals, 0.50))
    bandLower.push(pct(vals, 0.25))
  }

  const ruinProbability = finalEquities.filter(e => e < initialCapital * 0.5).length / simulations * 100

  return {
    simulations,
    p5FinalEquity:  pct(finalEquities, 0.05),
    p25FinalEquity: pct(finalEquities, 0.25),
    p50FinalEquity: pct(finalEquities, 0.50),
    p75FinalEquity: pct(finalEquities, 0.75),
    p95FinalEquity: pct(finalEquities, 0.95),
    p5MaxDrawdown:  pct(maxDrawdowns, 0.95),  // peor drawdown
    p50MaxDrawdown: pct(maxDrawdowns, 0.50),
    p5Return:  (pct(finalEquities, 0.05) / initialCapital - 1) * 100,
    p50Return: (pct(finalEquities, 0.50) / initialCapital - 1) * 100,
    p95Return: (pct(finalEquities, 0.95) / initialCapital - 1) * 100,
    ruinProbability,
    bandUpper,
    bandMedian,
    bandLower,
  }
}
