import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { KPIPanel } from './panels/KPIPanel'
import { TradesTable } from './panels/TradesTable'
import { EquityChart } from './charts/EquityChart'
import { DrawdownChart } from './charts/DrawdownChart'
import { YearlyBars } from './charts/YearlyBars'
import { MonthlyReturns } from './charts/MonthlyReturns'
import { MonteCarloPanel } from './charts/MonteCarloPanel'
import { Slider } from './ui/Slider'
import { fetchCandles } from '../services/twelveData'
import { runBacktest } from '../engine/backtestEngine'

type Tab = 'equity' | 'drawdown' | 'yearly' | 'monthly' | 'montecarlo' | 'trades'

const POPULAR_SYMBOLS = ['XAU/USD', 'BTC/USD', 'EUR/USD', 'NAS100', 'SPY', 'ETH/USD', 'AAPL', 'TSLA'] as const

const INTERVALS: { label: string; value: string }[] = [
  { label: '1D',   value: '1day'  },
  { label: '4H',   value: '4h'    },
  { label: '1H',   value: '1h'    },
  { label: '30M',  value: '30min' },
]

// ── Toggle button ────────────────────────────────────────────────────────────
function Toggle({ label, value, onChange, tooltip }: {
  label: string; value: boolean; onChange: (v: boolean) => void; tooltip?: string
}) {
  return (
    <div className="flex items-center gap-2" title={tooltip}>
      <span className="text-xs text-slate-500 w-28 shrink-0">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-amber-500' : 'bg-slate-700'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${value ? 'left-4' : 'left-0.5'}`} />
      </button>
      <span className={`text-[10px] font-mono ${value ? 'text-amber-400' : 'text-slate-600'}`}>
        {value ? 'ON' : 'OFF'}
      </span>
    </div>
  )
}

export function BacktestPage() {
  const {
    candles, setCandles, isLoadingCandles, setLoadingCandles, candleError, setCandleError,
    config, setConfig,
    strategyParams, setStrategyParams,
    backtestResult, setBacktestResult, isRunningBacktest, setRunningBacktest,
    setPage,
  } = useAppStore()

  const [tab, setTab] = useState<Tab>('equity')
  const [dataSource, setDataSource] = useState<'live' | 'cache' | 'demo' | null>(null)
  const [customSymbol, setCustomSymbol] = useState('')
  const [startDate, setStartDate] = useState('2019-01-01')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleFetchData = async () => {
    setLoadingCandles(true)
    setCandleError(null)
    try {
      const result = await fetchCandles(
        config.symbol,
        config.interval,
        config.apiKey,
        startDate
      )
      setCandles(result.candles)
      setDataSource(result.source)
    } catch (e: unknown) {
      setCandleError(String(e))
    } finally {
      setLoadingCandles(false)
    }
  }

  const handleRunBacktest = () => {
    if (!candles.length) {
      handleFetchData().then(() => {
        const c = useAppStore.getState().candles
        if (c.length) {
          setRunningBacktest(true)
          setTimeout(() => {
            const result = runBacktest(c, strategyParams, config.capital)
            setBacktestResult(result)
            setRunningBacktest(false)
          }, 0)
        }
      })
      return
    }
    setRunningBacktest(true)
    setTimeout(() => {
      const result = runBacktest(candles, strategyParams, config.capital)
      setBacktestResult(result)
      setRunningBacktest(false)
    }, 0)
  }

  const handleCustomSymbol = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && customSymbol.trim()) {
      setConfig({ symbol: customSymbol.trim().toUpperCase() })
      setCustomSymbol('')
    }
  }

  const candleDateRange = candles.length > 0
    ? `${candles[0].date.slice(0, 10)} → ${candles[candles.length - 1].date.slice(0, 10)}`
    : null

  const metrics = backtestResult?.metrics

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-4">

      {/* ── Controles ───────────────────────────────────────────────────────── */}
      <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">

          {/* Symbol chips */}
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 shrink-0">Símbolo</span>
            {POPULAR_SYMBOLS.map(sym => (
              <button
                key={sym}
                onClick={() => setConfig({ symbol: sym })}
                className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                  config.symbol === sym
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                {sym}
              </button>
            ))}
            <input
              type="text"
              value={customSymbol}
              onChange={e => setCustomSymbol(e.target.value.toUpperCase())}
              onKeyDown={handleCustomSymbol}
              placeholder="Otro… (Enter)"
              className="bg-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded-full border border-dashed border-slate-600 w-28 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
            />
            {!POPULAR_SYMBOLS.includes(config.symbol as typeof POPULAR_SYMBOLS[number]) && (
              <span className="px-2.5 py-1 text-xs rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 font-semibold">
                {config.symbol}
              </span>
            )}
          </div>

          {/* Timeframe buttons */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Intervalo</span>
            <div className="flex rounded overflow-hidden border border-slate-700">
              {INTERVALS.map(tf => (
                <button
                  key={tf.value}
                  onClick={() => setConfig({ interval: tf.value })}
                  className={`px-3 py-1.5 text-xs font-mono font-semibold transition-colors ${
                    config.interval === tf.value
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Capital */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500">Capital €</label>
            <input
              type="number" value={config.capital} min={1000} step={1000}
              onChange={e => setConfig({ capital: Number(e.target.value) })}
              className="w-24 bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700"
            />
          </div>

          {/* Start date + data fetch */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700 cursor-pointer"
            />
            <button
              onClick={handleFetchData}
              disabled={isLoadingCandles}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors disabled:opacity-50"
            >
              {isLoadingCandles ? '⟳ Cargando…' : '⬇ Cargar datos'}
            </button>

            {candles.length > 0 ? (
              <div className={`flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-mono border ${
                dataSource === 'cache' ? 'bg-slate-700/50 text-slate-400 border-slate-600' :
                dataSource === 'demo'  ? 'bg-amber-900/30 text-amber-400 border-amber-800/50' :
                'bg-emerald-900/30 text-emerald-400 border-emerald-800/50'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  dataSource === 'cache' ? 'bg-slate-400' :
                  dataSource === 'demo'  ? 'bg-amber-400' :
                  'bg-emerald-400'
                }`} />
                <span className="font-bold">{candles.length.toLocaleString()} velas</span>
                {candleDateRange && <span className="text-slate-500">{candleDateRange}</span>}
                {dataSource && <span className="opacity-60">· {dataSource.toUpperCase()}</span>}
              </div>
            ) : (
              <span className="text-[10px] text-slate-600">Sin datos cargados</span>
            )}
          </div>

          {/* ── Parámetros base ────────────────────────────────────────────── */}
          <Slider label="Risk %" value={strategyParams.riskPct} min={0.5} max={3} step={0.1} decimals={1} unit="%"
            onChange={v => setStrategyParams({ riskPct: v })} />
          <Slider label="Swing LB" value={strategyParams.swingLookback} min={5} max={25}
            onChange={v => setStrategyParams({ swingLookback: v })} />
          <Slider label="OB LB" value={strategyParams.obLookback} min={3} max={15}
            onChange={v => setStrategyParams({ obLookback: v })} />
          <Slider label="TP1 RR" value={strategyParams.tp1RR ?? 1.5} min={1} max={2.5} step={0.1} decimals={1}
            onChange={v => setStrategyParams({ tp1RR: v })} />
          <Slider label="TP2 RR" value={strategyParams.tp2RR} min={1.5} max={6} step={0.1} decimals={1}
            onChange={v => setStrategyParams({ tp2RR: v })} />
          <Slider label="SL Buffer" value={strategyParams.slBuffer} min={0.2} max={3} step={0.1} decimals={1}
            onChange={v => setStrategyParams({ slBuffer: v })} />
        </div>

        {/* ── Parámetros avanzados v2 ─────────────────────────────────────── */}
        <div>
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▶</span>
            Filtros avanzados SMC v2
            {showAdvanced && (
              <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded">
                {[
                  strategyParams.checkMitigation !== false && 'Mitigation',
                  strategyParams.breakEven && 'BreakEven',
                  strategyParams.requireFVG && 'FVG',
                ].filter(Boolean).join(' · ') || 'defaults'}
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-x-8 gap-y-3">
              {/* OB Body Ratio */}
              <Slider
                label="OB Body Ratio"
                value={strategyParams.obMinBodyRatio ?? 0.35}
                min={0} max={0.8} step={0.05} decimals={2}
                onChange={v => setStrategyParams({ obMinBodyRatio: v })}
              />

              {/* Min Sweep Extension */}
              <Slider
                label="Sweep Ext %"
                value={strategyParams.minSweepExtPct ?? 0}
                min={0} max={0.5} step={0.05} decimals={2} unit="%"
                onChange={v => setStrategyParams({ minSweepExtPct: v })}
              />

              {/* Toggles */}
              <Toggle
                label="Mitigation Check"
                value={strategyParams.checkMitigation !== false}
                onChange={v => setStrategyParams({ checkMitigation: v })}
                tooltip="Descarta Order Blocks que ya fueron testeados antes del sweep"
              />
              <Toggle
                label="Break-Even"
                value={strategyParams.breakEven ?? false}
                onChange={v => setStrategyParams({ breakEven: v })}
                tooltip="Mueve el SL a entry cuando se alcanza TP1"
              />
              <Toggle
                label="Require FVG"
                value={strategyParams.requireFVG ?? false}
                onChange={v => setStrategyParams({ requireFVG: v })}
                tooltip="Requiere un Fair Value Gap entre el OB y el sweep como confluencia"
              />
              <Toggle
                label="Regime Filter"
                value={strategyParams.regimeFilter ?? false}
                onChange={v => setStrategyParams({ regimeFilter: v })}
                tooltip="Solo opera en regímenes trending, evita mercados ranging y volátiles"
              />

              {/* Trend filter */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-28 shrink-0">Trend Filter</span>
                <div className="flex rounded overflow-hidden border border-slate-700">
                  {(['none', 'ema50', 'ema200'] as const).map(tf => (
                    <button
                      key={tf}
                      onClick={() => setStrategyParams({ trendFilter: tf })}
                      className={`px-2.5 py-1 text-xs font-mono transition-colors ${
                        (strategyParams.trendFilter ?? 'none') === tf
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {tf === 'none' ? 'OFF' : tf.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Acciones ────────────────────────────────────────────────────── */}
        <div className="flex gap-3 pt-1">
          {candleError && <p className="text-xs text-red-400 mr-auto">{candleError}</p>}
          <button
            onClick={handleRunBacktest}
            disabled={isRunningBacktest}
            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded transition-colors disabled:opacity-50 ml-auto"
          >
            {isRunningBacktest ? '⟳ Calculando…' : '▶ RUN BACKTEST'}
          </button>
          <button
            onClick={() => setPage('optimizer')}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded transition-colors"
          >
            ⚡ OPTIMIZAR
          </button>
        </div>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────────── */}
      {metrics && <KPIPanel metrics={metrics} capital={config.capital} />}

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      {metrics && (
        <>
          <div className="flex gap-1">
            {([
              ['equity',   '📈 Equity'],
              ['drawdown', '📉 Drawdown'],
              ['yearly',   '📅 Año'],
              ['monthly',     '🗓 Mensual'],
              ['montecarlo',  '🎲 Monte Carlo'],
              ['trades',      '📋 Trades'],
            ] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-1.5 text-xs rounded transition-colors ${
                  tab === id
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 bg-[#070d1a] border border-slate-800 rounded-lg overflow-hidden min-h-0">
            {tab === 'equity' && (
              <EquityChart data={metrics.equityCurve} initialCapital={config.capital} />
            )}
            {tab === 'drawdown' && (
              <DrawdownChart data={metrics.equityCurve} />
            )}
            {tab === 'yearly' && (
              <YearlyBars byYear={metrics.byYear} />
            )}
            {tab === 'monthly' && backtestResult && (
              <MonthlyReturns trades={backtestResult.trades} initialCapital={config.capital} />
            )}
            {tab === 'montecarlo' && backtestResult && (
              <MonteCarloPanel trades={backtestResult.trades} initialCapital={config.capital} />
            )}
            {tab === 'trades' && backtestResult && (
              <TradesTable trades={backtestResult.trades} />
            )}
          </div>
        </>
      )}

      {!metrics && !isRunningBacktest && (
        <div className="flex-1 flex items-center justify-center text-slate-700">
          <div className="text-center">
            <div className="text-4xl mb-3">◎</div>
            <p className="text-sm">Pulsa RUN BACKTEST para ver resultados</p>
            <p className="text-xs mt-1">Los datos demo se cargan automáticamente si no hay API key</p>
          </div>
        </div>
      )}
    </div>
  )
}
