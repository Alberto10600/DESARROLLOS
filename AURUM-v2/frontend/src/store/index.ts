import { create } from 'zustand'
import type { Page, StrategyParams, BacktestResult, MultiAssetResult, IbkrConfig, EngineState } from '../types'

const DEFAULT_PARAMS: StrategyParams = {
  breakout_period: 20,
  atr_period:      14,
  atr_sl_mult:     2.0,
  tp_rr:           3.0,
  target_vol_pct:  15.0,
  ema_filter:      0,
  slippage_pct:    0.05,
  commission:      2.0,
}

const DEFAULT_IBKR: IbkrConfig = {
  host:      '127.0.0.1',
  port:      7497,
  client_id: 1,
  account:   '',
  is_paper:  true,
}

const DEFAULT_ENGINE: EngineState = {
  connected: false, account: '', equity: 0,
  positions: [], daily_pnl: 0, daily_trades: 0,
}

interface Store {
  page: Page
  setPage: (p: Page) => void

  // Data config
  symbol:   string
  interval: string
  start:    string
  capital:  number
  setSymbol:   (s: string) => void
  setInterval: (s: string) => void
  setStart:    (s: string) => void
  setCapital:  (n: number) => void

  // Strategy
  params: StrategyParams
  setParams: (p: Partial<StrategyParams>) => void

  // Backtest
  result:     BacktestResult | null
  isRunning:  boolean
  setResult:  (r: BacktestResult | null) => void
  setRunning: (v: boolean) => void

  // Multi-asset validate
  multiResult:    MultiAssetResult | null
  isValidating:   boolean
  validateSymbols: string[]
  setMultiResult:    (r: MultiAssetResult | null) => void
  setValidating:     (v: boolean) => void
  setValidateSymbols:(s: string[]) => void

  // IBKR + engine
  ibkr:       IbkrConfig
  engine:     EngineState
  setIbkr:    (c: Partial<IbkrConfig>) => void
  setEngine:  (s: Partial<EngineState>) => void

  // WebSocket log
  log:    { time: string; type: string; message: string }[]
  addLog: (entry: { time: string; type: string; message: string }) => void
}

export const useStore = create<Store>((set) => ({
  page: 'workspace',
  setPage: (page) => set({ page }),

  symbol:   'XAU/USD',
  interval: '1day',
  start:    '2018-01-01',
  capital:  10_000,
  setSymbol:   (symbol)   => set({ symbol }),
  setInterval: (interval) => set({ interval }),
  setStart:    (start)    => set({ start }),
  setCapital:  (capital)  => set({ capital }),

  params: DEFAULT_PARAMS,
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),

  result: null, isRunning: false,
  setResult:  (result)  => set({ result }),
  setRunning: (isRunning) => set({ isRunning }),

  multiResult: null, isValidating: false,
  validateSymbols: ['XAU/USD', 'BTC/USD', 'EUR/USD', 'NAS100'],
  setMultiResult:    (multiResult)     => set({ multiResult }),
  setValidating:     (isValidating)    => set({ isValidating }),
  setValidateSymbols:(validateSymbols) => set({ validateSymbols }),

  ibkr:    DEFAULT_IBKR,
  engine:  DEFAULT_ENGINE,
  setIbkr:   (c) => set((s) => ({ ibkr:   { ...s.ibkr,   ...c } })),
  setEngine: (e) => set((s) => ({ engine: { ...s.engine, ...e } })),

  log: [],
  addLog: (entry) => set((s) => ({ log: [entry, ...s.log].slice(0, 200) })),
}))
