/**
 * Bayesian Optimization Web Worker
 * Corre el optimizador en background para no bloquear la UI.
 */

import { BayesianOptimizer } from './optimizer'
import type { BayesianOptions, BayesianState, Observation, Candle } from '../../types'

let optimizer: BayesianOptimizer | null = null

self.onmessage = async ({ data }: {
  data:
    | { type: 'START'; payload: { candles: Candle[]; capital: number; options: BayesianOptions } }
    | { type: 'STOP' }
}) => {
  const { type } = data

  if (type === 'START') {
    const { candles, capital, options } = data.payload

    optimizer = new BayesianOptimizer(candles, capital, options)

    await optimizer.run(
      (state: BayesianState) => {
        self.postMessage({ type: 'PROGRESS', state })
      },
      (obs: Observation) => {
        self.postMessage({ type: 'NEW_BEST', observation: obs })
      }
    )

    self.postMessage({ type: 'DONE' })
  }

  if (type === 'STOP') {
    optimizer?.stop()
    optimizer = null
  }
}
