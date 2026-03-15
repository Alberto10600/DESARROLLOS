/**
 * Walk-Forward Analysis (WFA)
 * ───────────────────────────
 * Divide los datos en ventanas deslizantes:
 *   - Training (IS): optimizar parámetros
 *   - Test (OOS): validar sin ver los datos
 *
 * Resultado: consistencia entre ventanas como medida de robustez real.
 * Si IS >>> OOS → overfitting.
 * Si IS ≈ OOS  → robustez genuina.
 *
 * Flujo:
 *   1. Generar N ventanas (training + test)
 *   2. Para cada ventana: hallar mejor param en IS via búsqueda rápida
 *   3. Aplicar esos params en OOS y medir métricas
 *   4. Calcular consistencia WFA = mean(OOS metrics) / mean(IS metrics)
 */

import type { Candle, StrategyParams, BacktestMetrics } from '../types'
import { runBacktest, calcScore } from './backtestEngine'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WFAWindow {
  windowIndex: number
  isCandlesFrom: string
  isCandlesTo: string
  oosCandlesFrom: string
  oosCandlesTo: string
  isMetrics: BacktestMetrics
  oosMetrics: BacktestMetrics
  bestParams: StrategyParams
  isScore: number
  oosScore: number
  consistency: number       // oosScore / isScore (1.0 = perfecto)
}

export interface WFAResult {
  windows: WFAWindow[]
  avgIsScore: number
  avgOosScore: number
  consistency: number       // promedio de ratios por ventana
  degradation: number       // 1 - (avgOos/avgIs): cuánto degrada en OOS
  isRobust: boolean         // consistency >= 0.5
  bestOosParams: StrategyParams   // params con mejor OOS score
  summary: WFAMetricsSummary
}

export interface WFAMetricsSummary {
  avgOosWinRate: number
  avgOosProfitFactor: number
  avgOosMaxDD: number
  avgOosSharpe: number
  avgOosReturn: number
  positiveWindows: number
  totalWindows: number
}

export interface WFAOptions {
  trainPct: number        // % datos para training (ej: 0.7 = 70%)
  stepPct: number         // % avance de la ventana (ej: 0.1 = 10%)
  minWindowCandles: number // mínimo de velas por ventana
  capital: number
}

export interface WFAProgress {
  currentWindow: number
  totalWindows: number
  phase: 'training' | 'testing'
  latestWindow?: WFAWindow
}

// ─── Candidate params para IS optimization ───────────────────────────────────
// Grid reducido para que la búsqueda IS sea rápida

const IS_GRID_CANDIDATES: Partial<StrategyParams>[] = [
  // Variantes de swingLookback y obLookback
  ...([8, 12, 15, 20] as const).flatMap(swing =>
    ([5, 8, 10] as const).flatMap(ob =>
      ([2.5, 3, 4] as const).map(tp2 => ({
        swingLookback: swing,
        obLookback: ob,
        tp1RR: 1.5,
        tp2RR: tp2,
        riskPct: 1,
        slBuffer: 1,
        compounding: true,
        checkMitigation: true,
        obMinBodyRatio: 0.35,
        breakEven: false,
      }))
    )
  ),
]

// ─── Walk-Forward Engine ─────────────────────────────────────────────────────

export async function runWalkForward(
  candles: Candle[],
  baseParams: StrategyParams,
  options: WFAOptions,
  onProgress: (p: WFAProgress) => void,
  cancelRef: { current: boolean }
): Promise<WFAResult> {
  const { trainPct, stepPct, minWindowCandles, capital } = options
  const n = candles.length

  // Generar ventanas
  const windowSize = Math.floor(n * trainPct * (1 + (1 - trainPct) / trainPct))
  const stepSize   = Math.max(Math.floor(n * stepPct), minWindowCandles)
  const windows: WFAWindow[] = []

  const trainSize  = Math.floor(windowSize * trainPct)
  const testSize   = windowSize - trainSize

  if (trainSize < minWindowCandles || testSize < minWindowCandles / 2) {
    throw new Error(`Datos insuficientes para WFA. Necesitas al menos ${minWindowCandles * 4} velas.`)
  }

  // Calcular cuántas ventanas caben
  const windowStarts: number[] = []
  for (let start = 0; start + windowSize <= n; start += stepSize) {
    windowStarts.push(start)
  }

  if (windowStarts.length < 2) {
    throw new Error(`Datos insuficientes para Walk-Forward. Prueba con menos ventanas o más datos.`)
  }

  const totalWindows = windowStarts.length

  for (let wi = 0; wi < windowStarts.length; wi++) {
    if (cancelRef.current) break

    const isStart  = windowStarts[wi]
    const isEnd    = isStart + trainSize
    const oosStart = isEnd
    const oosEnd   = Math.min(oosStart + testSize, n)

    if (oosEnd <= oosStart) continue

    const isCandles  = candles.slice(isStart, isEnd)
    const oosCandles = candles.slice(oosStart, oosEnd)

    onProgress({ currentWindow: wi + 1, totalWindows, phase: 'training' })
    await microtask()

    // ── IS: encontrar mejor combo de params ──────────────────────────────
    let bestIsScore = -Infinity
    let bestParams  = { ...baseParams }

    for (let ci = 0; ci < IS_GRID_CANDIDATES.length; ci++) {
      if (cancelRef.current) break
      if (ci % 20 === 0) await microtask()

      const p: StrategyParams = { ...baseParams, ...IS_GRID_CANDIDATES[ci] }
      try {
        const result = runBacktest(isCandles, p, capital)
        const score  = calcScore(result.metrics)
        if (score > bestIsScore) {
          bestIsScore = score
          bestParams  = p
        }
      } catch {
        // skip bad combos
      }
    }

    const isResult = runBacktest(isCandles, bestParams, capital)

    // ── OOS: aplicar params encontrados en IS ─────────────────────────────
    onProgress({ currentWindow: wi + 1, totalWindows, phase: 'testing' })

    const oosResult = runBacktest(oosCandles, bestParams, capital)
    const oosScore  = calcScore(oosResult.metrics)

    const consistency = bestIsScore > 0 ? oosScore / bestIsScore : (oosScore > 0 ? 1 : 0)

    const wfaWindow: WFAWindow = {
      windowIndex:    wi,
      isCandlesFrom:  isCandles[0]?.date?.slice(0, 10) ?? '',
      isCandlesTo:    isCandles[isCandles.length - 1]?.date?.slice(0, 10) ?? '',
      oosCandlesFrom: oosCandles[0]?.date?.slice(0, 10) ?? '',
      oosCandlesTo:   oosCandles[oosCandles.length - 1]?.date?.slice(0, 10) ?? '',
      isMetrics:      isResult.metrics,
      oosMetrics:     oosResult.metrics,
      bestParams,
      isScore:        bestIsScore,
      oosScore,
      consistency,
    }

    windows.push(wfaWindow)
    onProgress({ currentWindow: wi + 1, totalWindows, phase: 'testing', latestWindow: wfaWindow })
    await microtask()
  }

  // ── Calcular métricas globales WFA ────────────────────────────────────────
  if (windows.length === 0) {
    throw new Error('No se completó ninguna ventana WFA.')
  }

  const validWindows = windows.filter(w => w.isScore > 0)

  const avgIsScore  = windows.reduce((s, w) => s + w.isScore, 0)  / windows.length
  const avgOosScore = windows.reduce((s, w) => s + w.oosScore, 0) / windows.length
  const consistency = avgIsScore > 0 ? avgOosScore / avgIsScore : 0
  const degradation = 1 - Math.max(0, consistency)

  // Mejor OOS params
  const bestOosWindow = windows.reduce((best, w) => w.oosScore > best.oosScore ? w : best)

  const positiveWindows = windows.filter(w => w.oosMetrics.totalReturn > 0).length

  const summary: WFAMetricsSummary = {
    avgOosWinRate:      windows.reduce((s, w) => s + w.oosMetrics.winRate, 0)       / windows.length,
    avgOosProfitFactor: windows.reduce((s, w) => s + w.oosMetrics.profitFactor, 0)  / windows.length,
    avgOosMaxDD:        windows.reduce((s, w) => s + w.oosMetrics.maxDrawdown, 0)   / windows.length,
    avgOosSharpe:       windows.reduce((s, w) => s + w.oosMetrics.sharpeRatio, 0)   / windows.length,
    avgOosReturn:       windows.reduce((s, w) => s + w.oosMetrics.totalReturn, 0)   / windows.length,
    positiveWindows,
    totalWindows:       windows.length,
  }

  return {
    windows,
    avgIsScore,
    avgOosScore,
    consistency,
    degradation,
    isRobust: consistency >= 0.45 && positiveWindows >= Math.ceil(windows.length * 0.5),
    bestOosParams:  bestOosWindow.bestParams,
    summary,
  }
}

function microtask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}
