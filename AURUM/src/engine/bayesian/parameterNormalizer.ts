/**
 * ParameterNormalizer
 * Convierte parámetros de estrategia ↔ vectores normalizados [0,1]
 * para que el Gaussian Process opere en un espacio homogéneo.
 *
 * También implementa Latin Hypercube Sampling (LHS) para la
 * exploración inicial, que cubre el espacio mejor que aleatorio puro.
 */

import type { StrategyParams, ParameterSpace } from '../../types'
import { PARAM_KEYS, type ParamKey } from './types'

export class ParameterNormalizer {
  constructor(private space: ParameterSpace) {}

  /** Params → vector normalizado [0,1]^d */
  normalize(params: StrategyParams): number[] {
    return PARAM_KEYS.map(key => {
      const { min, max } = this.space[key]
      const val = (params as Record<string, number>)[key] ?? min
      return Math.max(0, Math.min(1, (val - min) / (max - min)))
    })
  }

  /** Vector normalizado → StrategyParams (con redondeo para enteros) */
  denormalize(vector: number[]): StrategyParams {
    const params: Partial<StrategyParams> = {}
    PARAM_KEYS.forEach((key, i) => {
      const { min, max, type } = this.space[key]
      const raw = min + vector[i] * (max - min)
      ;(params as Record<string, number>)[key] =
        type === 'int' ? Math.round(raw) : Math.round(raw * 100) / 100
    })
    return {
      ...(params as StrategyParams),
      compounding: true,
    }
  }

  /** Punto aleatorio uniforme en [0,1]^d */
  randomPoint(): number[] {
    return PARAM_KEYS.map(() => Math.random())
  }

  /**
   * Latin Hypercube Sampling — genera n puntos con mejor cobertura
   * que muestreo aleatorio puro.
   *
   * Para cada dimensión divide [0,1] en n estratos y
   * toma exactamente un punto de cada estrato, luego baraja
   * las dimensiones de forma independiente.
   */
  latinHypercubeSample(n: number): number[][] {
    const d = PARAM_KEYS.length

    // Generar posiciones de estrato para cada dimensión
    const samples: number[][] = Array.from({ length: n }, () => new Array(d).fill(0))

    for (let dim = 0; dim < d; dim++) {
      // Índices de estrato mezclados aleatoriamente
      const strata = Array.from({ length: n }, (_, i) => i)
      shuffleArray(strata)

      for (let i = 0; i < n; i++) {
        // Punto aleatorio dentro del estrato k
        samples[i][dim] = (strata[i] + Math.random()) / n
      }
    }

    return samples
  }

  get dimension(): number {
    return PARAM_KEYS.length
  }
}

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────
function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}
