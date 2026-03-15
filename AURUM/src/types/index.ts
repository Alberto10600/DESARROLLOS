// ─── Candle ───────────────────────────────────────────────────────────────────

export interface Candle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
  timestamp: number
}

// ─── Strategy Parameters ──────────────────────────────────────────────────────

export interface StrategyParams {
  swingLookback: number   // velas para detectar swing high/low
  obLookback: number      // velas atrás para buscar Order Block
  tp1RR: number           // RR para TP1 (cierra 50%)
  tp2RR: number           // RR para TP2 (cierra restante)
  riskPct: number         // % del equity por operación
  slBuffer: number        // puntos extra sobre el extremo del OB

  // Filtros opcionales de estrategia extendida
  useLondonSession?: boolean
  useNYSession?: boolean
  useAsiaSession?: boolean
  trendFilter?: 'none' | 'ema50' | 'ema200' | 'structure'
  trendStrength?: number
  atrFilter?: boolean
  atrPeriod?: number
  atrMinThreshold?: number
  maxTradesPerDay?: number
  minRiskReward?: number
  trailingStop?: boolean
  trailingFactor?: number
  compounding?: boolean
  maxDailyLoss?: number
  maxConsecutiveLosses?: number

  // ── Parámetros v2: calidad de señal ───────────────────────────────────────
  obMinBodyRatio?: number      // ratio mínimo body/rango del OB (0.0-1.0), default 0.35
  requireFVG?: boolean         // exigir FVG entre OB y sweep como confluencia
  checkMitigation?: boolean    // descartar OBs ya testeados (mitigados), default true
  minSweepExtPct?: number      // extensión mínima del wick sobre el swing (% del precio)

  // ── Parámetros v2: gestión de riesgo ─────────────────────────────────────
  breakEven?: boolean          // mover SL a entry tras alcanzar TP1

  // ── Parámetros v2: régimen de mercado ────────────────────────────────────
  regimeFilter?: boolean       // solo operar en régimen trending (no ranging, no volatile)
}

// ─── Trade ────────────────────────────────────────────────────────────────────

export type TradeDirection = 'LONG' | 'SHORT'
export type TradeResult   = 'WIN' | 'LOSS' | 'PARTIAL'

export interface Trade {
  id: number
  date: string
  year: number
  direction: TradeDirection
  result: TradeResult
  entry: number
  sl: number
  tp1: number
  tp2: number
  pnl: number       // en euros
  pnlR: number      // en R múltiplos
  equity: number    // equity después del trade
  mae: number       // max adverse excursion (puntos)
  mfe: number       // max favorable excursion (puntos)
}

// ─── Yearly Stats ─────────────────────────────────────────────────────────────

export interface YearlyStats {
  year: number
  trades: number
  wins: number
  losses: number
  partials: number
  winRate: number
  pnl: number
  returnPct: number
  startEquity: number
  endEquity: number
  maxDrawdown: number
}

// ─── Backtest Metrics ─────────────────────────────────────────────────────────

export interface BacktestMetrics {
  // Performance
  totalReturn: number
  cagr: number
  finalEquity: number
  netPnL: number

  // Trade stats
  totalTrades: number
  wins: number
  losses: number
  partials: number
  winRate: number
  avgWin: number
  avgLoss: number
  avgRR: number

  // Risk
  profitFactor: number
  maxDrawdown: number
  maxDrawdownDuration: number
  sharpeRatio: number
  calmarRatio: number

  // Yearly breakdown
  byYear: Record<number, YearlyStats>

  // Equity curve points
  equityCurve: { date: string; equity: number; drawdown: number }[]
}

// ─── Backtest Result ──────────────────────────────────────────────────────────

export interface BacktestResult {
  trades: Trade[]
  metrics: BacktestMetrics
  params: StrategyParams
}

// ─── Optimizer Types ──────────────────────────────────────────────────────────

export interface GridParams {
  swingLookback: number[]
  obLookback: number[]
  tp2RR: number[]
  riskPct: number[]
  slBuffer: number[]
}

export interface OptimizationResult {
  params: StrategyParams
  score: number
  metrics: BacktestMetrics
  rank: number
}

// ─── Bayesian Optimization ────────────────────────────────────────────────────

export interface ParameterBound {
  min: number
  max: number
  type: 'int' | 'float'
}

export interface ParameterSpace {
  swingLookback: ParameterBound
  obLookback: ParameterBound
  tp2RR: ParameterBound
  riskPct: ParameterBound
  slBuffer: ParameterBound
  tp1RR: ParameterBound
}

export interface Observation {
  params: StrategyParams
  score: number
  metrics: BacktestMetrics
  iteration: number
  timestamp: number
}

export interface BayesianState {
  observations: Observation[]
  bestObservation: Observation | null
  iteration: number
  totalIterations: number
  phase: 'initial' | 'bayesian' | 'done'
  isRunning: boolean
  convergenceHistory: number[]  // mejor score acumulado por iteración
  allScores: number[]           // score crudo de cada evaluación
}

export type AcquisitionFn = 'EI' | 'UCB' | 'PI'

export interface BayesianOptions {
  nInitial: number
  nIterations: number
  acquisitionFn: AcquisitionFn
  explorationFactor: number
  nRestarts: number
}

// ─── Saved Optimization ───────────────────────────────────────────────────────

export interface SavedOptimization {
  id: string
  date: string
  method: 'grid' | 'bayesian'
  symbol: string
  interval: string
  capital: number
  observations?: Observation[]
  results?: OptimizationResult[]
  bestParams: StrategyParams
  bestMetrics: BacktestMetrics
  duration: number
}

// ─── App Config ───────────────────────────────────────────────────────────────

export interface AppConfig {
  capital: number
  defaultRisk: number
  symbol: string
  interval: string
  showSessions: boolean
  compounding: boolean
  theme: 'dark' | 'darker' | 'midnight'
  apiKey: string
}

// ─── App State (Zustand) ──────────────────────────────────────────────────────

export type AppPage = 'dashboard' | 'backtesting' | 'optimizer' | 'trades' | 'strategy' | 'settings'

export interface AppState {
  // Navigation
  currentPage: AppPage
  setPage: (page: AppPage) => void

  // Config
  config: AppConfig
  setConfig: (config: Partial<AppConfig>) => void

  // Candles
  candles: Candle[]
  isLoadingCandles: boolean
  candleError: string | null
  setCandles: (candles: Candle[]) => void
  setLoadingCandles: (v: boolean) => void
  setCandleError: (e: string | null) => void

  // Backtest
  backtestResult: BacktestResult | null
  isRunningBacktest: boolean
  setBacktestResult: (r: BacktestResult | null) => void
  setRunningBacktest: (v: boolean) => void
  strategyParams: StrategyParams
  setStrategyParams: (p: Partial<StrategyParams>) => void

  // Optimizer
  gridResults: OptimizationResult[]
  gridProgress: number
  isGridRunning: boolean
  setGridResults: (r: OptimizationResult[]) => void
  setGridProgress: (p: number) => void
  setGridRunning: (v: boolean) => void

  bayesianState: BayesianState | null
  setBayesianState: (s: BayesianState | null) => void

  savedOptimizations: SavedOptimization[]
  addSavedOptimization: (o: SavedOptimization) => void
}
