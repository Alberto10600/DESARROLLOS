export type Page = 'workspace' | 'validate' | 'deploy' | 'monitor'

export interface StrategyParams {
  breakout_period: number
  atr_period:      number
  atr_sl_mult:     number
  tp_rr:           number
  target_vol_pct:  number
  ema_filter:      number
  slippage_pct:    number
  commission:      number
}

export interface BacktestMetrics {
  total_return:    number
  cagr:            number
  final_equity:    number
  net_pnl:         number
  total_trades:    number
  wins:            number
  losses:          number
  win_rate:        number
  avg_win:         number
  avg_loss:        number
  avg_rr:          number
  profit_factor:   number
  max_drawdown:    number
  max_dd_duration: number
  sharpe:          number
  sortino:         number
  calmar:          number
  total_costs:     number
  equity_curve:    { date: string; equity: number; drawdown: number }[]
  by_year:         Record<number, { year: number; trades: number; pnl: number; win_rate: number; return_pct: number }>
}

export interface BacktestResult {
  source:  string
  score:   number
  metrics: BacktestMetrics
  trades:  TradeRow[]
}

export interface TradeRow {
  id:         number
  direction:  'LONG' | 'SHORT'
  entry_date: string
  exit_date:  string
  entry:      number
  sl:         number
  tp:         number
  pnl:        number
  pnl_r:      number
  result:     'WIN' | 'LOSS'
  mae:        number
  mfe:        number
  equity:     number
}

export interface AssetResult {
  symbol:        string
  score:         number
  trades:        number
  win_rate:      number
  profit_factor: number
  max_drawdown:  number
  sharpe:        number
  cagr:          number
}

export interface MultiAssetResult {
  assets:         AssetResult[]
  robustness:     number
  consistent:     number
  total:          number
  weighted_score: number
}

export interface IbkrConfig {
  host:      string
  port:      number
  client_id: number
  account:   string
  is_paper:  boolean
}

export interface EngineState {
  connected:    boolean
  account:      string
  equity:       number
  positions:    { symbol: string; position: number; avg_cost: number; unrealized_pnl: number }[]
  daily_pnl:    number
  daily_trades: number
}
