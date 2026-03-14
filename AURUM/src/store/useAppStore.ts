import { create } from 'zustand'
import type {
  AppState,
  AppPage,
  AppConfig,
  Candle,
  BacktestResult,
  StrategyParams,
  OptimizationResult,
  BayesianState,
  SavedOptimization,
} from '../types'

const DEFAULT_CONFIG: AppConfig = {
  capital: 5000,
  defaultRisk: 1,
  symbol: 'XAU/USD',
  interval: '1day',
  showSessions: true,
  compounding: true,
  theme: 'dark',
  apiKey: '',
}

const DEFAULT_PARAMS: StrategyParams = {
  swingLookback: 12,
  obLookback: 8,
  tp1RR: 1.5,
  tp2RR: 3,
  riskPct: 1,
  slBuffer: 1,
  compounding: true,
}

export const useAppStore = create<AppState>((set) => ({
  // ── Navigation ──────────────────────────────────────────────────────────────
  currentPage: 'backtesting',
  setPage: (page: AppPage) => set({ currentPage: page }),

  // ── Config ──────────────────────────────────────────────────────────────────
  config: DEFAULT_CONFIG,
  setConfig: (config: Partial<AppConfig>) =>
    set(state => ({ config: { ...state.config, ...config } })),

  // ── Candles ─────────────────────────────────────────────────────────────────
  candles: [],
  isLoadingCandles: false,
  candleError: null,
  setCandles: (candles: Candle[]) => set({ candles }),
  setLoadingCandles: (v: boolean) => set({ isLoadingCandles: v }),
  setCandleError: (e: string | null) => set({ candleError: e }),

  // ── Backtest ────────────────────────────────────────────────────────────────
  backtestResult: null,
  isRunningBacktest: false,
  setBacktestResult: (r: BacktestResult | null) => set({ backtestResult: r }),
  setRunningBacktest: (v: boolean) => set({ isRunningBacktest: v }),
  strategyParams: DEFAULT_PARAMS,
  setStrategyParams: (p: Partial<StrategyParams>) =>
    set(state => ({ strategyParams: { ...state.strategyParams, ...p } })),

  // ── Grid Search ─────────────────────────────────────────────────────────────
  gridResults: [],
  gridProgress: 0,
  isGridRunning: false,
  setGridResults: (r: OptimizationResult[]) => set({ gridResults: r }),
  setGridProgress: (p: number) => set({ gridProgress: p }),
  setGridRunning: (v: boolean) => set({ isGridRunning: v }),

  // ── Bayesian Optimization ────────────────────────────────────────────────────
  bayesianState: null,
  setBayesianState: (s: BayesianState | null) => set({ bayesianState: s }),

  // ── History ─────────────────────────────────────────────────────────────────
  savedOptimizations: [],
  addSavedOptimization: (o: SavedOptimization) =>
    set(state => ({
      savedOptimizations: [o, ...state.savedOptimizations].slice(0, 10)
    })),
}))
