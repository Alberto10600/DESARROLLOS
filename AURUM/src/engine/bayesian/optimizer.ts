/**
 * BayesianOptimizer
 * ─────────────────
 * Algoritmo principal de Bayesian Optimization con GP + EI/UCB/PI.
 *
 * Flujo:
 *  1. Fase inicial: nInitial puntos vía Latin Hypercube Sampling
 *  2. Fase bayesiana: nIterations pasos guiados por el GP
 *     a. Actualizar GP con todas las observaciones
 *     b. Maximizar la función de adquisición (multi-start random search)
 *     c. Evaluar el backtest en el punto seleccionado
 *     d. Actualizar el mejor resultado
 */

import { GaussianProcess } from './gaussianProcess'
import { ParameterNormalizer } from './parameterNormalizer'
import { acquisitionValue } from './acquisitionFunction'
import { runBacktest, calcScore } from '../backtestEngine'
import { PARAMETER_SPACE } from './types'
import type {
  BayesianState,
  BayesianOptions,
  Observation,
  Candle,
  StrategyParams,
} from '../../types'

export class BayesianOptimizer {
  private gp: GaussianProcess
  private normalizer: ParameterNormalizer
  private observations: Observation[] = []
  private shouldStop = false

  constructor(
    private candles: Candle[],
    private capital: number,
    private options: BayesianOptions
  ) {
    this.gp = new GaussianProcess(1.0, 1.0, 1e-4)
    this.normalizer = new ParameterNormalizer(PARAMETER_SPACE)
  }

  // ── Parar la optimización ─────────────────────────────────────────────────
  stop(): void {
    this.shouldStop = true
  }

  // ── Evaluar un punto normalizado ──────────────────────────────────────────
  private evaluatePoint(xNorm: number[], iteration: number): Observation {
    const params = this.normalizer.denormalize(xNorm)
    const result = runBacktest(this.candles, params, this.capital)
    const score  = calcScore(result.metrics)
    return {
      params,
      score,
      metrics: result.metrics,
      iteration,
      timestamp: Date.now(),
    }
  }

  // ── Maximizar la función de adquisición ───────────────────────────────────
  // Multi-start random search: genera nRestarts candidatos y devuelve el mejor.
  // Complementado con refinamiento local (perturbación gaussiana).
  private findNextPoint(): number[] {
    const { acquisitionFn, explorationFactor, nRestarts } = this.options
    const bestScore = this.observations.length > 0
      ? Math.max(...this.observations.map(o => o.score))
      : 0

    const dim = this.normalizer.dimension
    let bestAcq = -Infinity
    let bestPoint: number[] = this.normalizer.randomPoint()

    const candidates = [
      ...this.normalizer.latinHypercubeSample(nRestarts),
    ]

    // También añadir perturbaciones del mejor punto actual
    const bestObs = this.observations.reduce(
      (best, o) => (!best || o.score > best.score) ? o : best,
      null as Observation | null
    )
    if (bestObs) {
      const bestNorm = this.normalizer.normalize(bestObs.params)
      for (let i = 0; i < Math.floor(nRestarts / 4); i++) {
        const perturbed = bestNorm.map(v =>
          Math.max(0, Math.min(1, v + (Math.random() - 0.5) * 0.2))
        )
        candidates.push(perturbed)
      }
    }

    for (const candidate of candidates) {
      const { mean, variance } = this.gp.predict(candidate)
      const acq = acquisitionValue(mean, variance, bestScore, acquisitionFn, explorationFactor)
      if (acq > bestAcq) {
        bestAcq   = acq
        bestPoint = candidate
      }
    }

    return bestPoint
  }

  // ── Run principal ─────────────────────────────────────────────────────────
  async run(
    onProgress: (state: BayesianState) => void,
    onNewBest: (obs: Observation) => void
  ): Promise<BayesianState> {
    const { nInitial, nIterations } = this.options
    const total = nInitial + nIterations

    let bestObservation: Observation | null = null
    const convergenceHistory: number[] = []
    const allScores: number[] = []

    const buildState = (phase: BayesianState['phase'], iter: number): BayesianState => ({
      observations: [...this.observations],
      bestObservation,
      iteration: iter,
      totalIterations: total,
      phase,
      isRunning: !this.shouldStop && phase !== 'done',
      convergenceHistory: [...convergenceHistory],
      allScores: [...allScores],
    })

    // ── Fase 1: Exploración inicial con LHS ──────────────────────────────────
    const initialPoints = this.normalizer.latinHypercubeSample(nInitial)
    for (let i = 0; i < nInitial; i++) {
      if (this.shouldStop) break

      const obs = this.evaluatePoint(initialPoints[i], i)
      this.observations.push(obs)
      allScores.push(obs.score)

      if (!bestObservation || obs.score > bestObservation.score) {
        bestObservation = obs
        onNewBest(obs)
      }
      convergenceHistory.push(bestObservation.score)
      onProgress(buildState('initial', i + 1))

      // Ceder el hilo cada 5 evaluaciones para que el worker no congele
      if (i % 5 === 0) await microtask()
    }

    // ── Fase 2: Bayesian Optimization ────────────────────────────────────────
    for (let i = 0; i < nIterations; i++) {
      if (this.shouldStop) break

      const iteration = nInitial + i

      // Actualizar GP con todas las observaciones
      const X = this.observations.map(o => this.normalizer.normalize(o.params))
      const y = this.observations.map(o => o.score)
      this.gp.fit(X, y)

      // Optimizar hyperparámetros cada 10 iteraciones (costoso)
      if (i % 10 === 0) this.gp.optimizeHyperparams()

      // Seleccionar siguiente punto
      const nextPoint = this.findNextPoint()
      const obs = this.evaluatePoint(nextPoint, iteration)
      this.observations.push(obs)
      allScores.push(obs.score)

      if (!bestObservation || obs.score > bestObservation.score) {
        bestObservation = obs
        onNewBest(obs)
      }
      convergenceHistory.push(bestObservation.score)
      onProgress(buildState('bayesian', iteration + 1))

      if (i % 3 === 0) await microtask()
    }

    const finalState = buildState('done', total)
    finalState.isRunning = false
    onProgress(finalState)
    return finalState
  }
}

// Ceder el hilo (permite procesar mensajes entre iteraciones)
function microtask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}
