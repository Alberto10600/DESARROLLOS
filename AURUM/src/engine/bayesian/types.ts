// Re-export from central types for convenience
export type {
  ParameterSpace,
  ParameterBound,
  Observation,
  BayesianState,
  BayesianOptions,
  AcquisitionFn,
  StrategyParams,
  BacktestMetrics,
} from '../../types'

// Default parameter space for SMC strategy
export const PARAMETER_SPACE = {
  swingLookback: { min: 5,   max: 25,  type: 'int'   as const },
  obLookback:    { min: 3,   max: 15,  type: 'int'   as const },
  tp2RR:         { min: 1.5, max: 6,   type: 'float' as const },
  riskPct:       { min: 0.5, max: 3,   type: 'float' as const },
  slBuffer:      { min: 0.2, max: 3,   type: 'float' as const },
  tp1RR:         { min: 1.0, max: 2.5, type: 'float' as const },
}

// Keys in the order they appear in normalized vectors
export const PARAM_KEYS = [
  'swingLookback',
  'obLookback',
  'tp2RR',
  'riskPct',
  'slBuffer',
  'tp1RR',
] as const

export type ParamKey = typeof PARAM_KEYS[number]
