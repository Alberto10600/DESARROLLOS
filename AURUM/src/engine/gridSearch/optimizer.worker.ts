/**
 * Grid Search Optimizer - Web Worker
 * Prueba todas las combinaciones del grid y reporta progreso.
 */

import { runBacktest, calcScore } from '../backtestEngine'
import type { Candle, StrategyParams, OptimizationResult, GridParams } from '../../types'

// Genera todas las combinaciones del grid (producto cartesiano)
function* generateCombinations(grid: GridParams): Generator<StrategyParams> {
  for (const swing of grid.swingLookback)
  for (const ob of grid.obLookback)
  for (const tp2 of grid.tp2RR)
  for (const risk of grid.riskPct)
  for (const sl of grid.slBuffer) {
    yield {
      swingLookback: swing,
      obLookback: ob,
      tp1RR: 1.5,
      tp2RR: tp2,
      riskPct: risk,
      slBuffer: sl,
      compounding: true,
    }
  }
}

function countCombinations(grid: GridParams): number {
  return (
    grid.swingLookback.length *
    grid.obLookback.length *
    grid.tp2RR.length *
    grid.riskPct.length *
    grid.slBuffer.length
  )
}

self.onmessage = ({ data }: { data: { candles: Candle[]; grid: GridParams; capital: number } }) => {
  const { candles, grid, capital } = data
  const results: OptimizationResult[] = []
  const total = countCombinations(grid)
  let done = 0

  for (const params of generateCombinations(grid)) {
    const result = runBacktest(candles, params, capital)
    const score  = calcScore(result.metrics)

    results.push({ params, score, metrics: result.metrics, rank: 0 })
    done++

    if (done % 10 === 0 || done === total) {
      self.postMessage({ type: 'progress', pct: (done / total) * 100, done, total })
    }
  }

  // Ordenar por score
  results.sort((a, b) => b.score - a.score)
  results.forEach((r, i) => (r.rank = i + 1))

  self.postMessage({ type: 'done', results: results.slice(0, 50) })
}
