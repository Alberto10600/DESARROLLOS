import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { KPIPanel } from './panels/KPIPanel'
import { TradesTable } from './panels/TradesTable'
import { EquityChart } from './charts/EquityChart'
import { DrawdownChart } from './charts/DrawdownChart'
import { YearlyBars } from './charts/YearlyBars'
import { Slider } from './ui/Slider'
import { fetchCandles } from '../services/twelveData'
import { runBacktest } from '../engine/backtestEngine'

type Tab = 'equity' | 'drawdown' | 'yearly' | 'trades'

const INTERVALS = ['1day', '4h', '1h', '30min'] as const
const SYMBOLS   = ['XAU/USD', 'BTC/USD', 'EUR/USD', 'SPY', 'AAPL'] as const

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

  const handleFetchData = async () => {
    setLoadingCandles(true)
    setCandleError(null)
    try {
      const result = await fetchCandles(
        config.symbol,
        config.interval,
        config.apiKey,
        '2019-01-01'
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

  const metrics = backtestResult?.metrics

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-4">

      {/* ── Controles ───────────────────────────────────────────────────────── */}
      <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {/* Fila 1 */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Símbolo</label>
              <select
                value={config.symbol}
                onChange={e => setConfig({ symbol: e.target.value })}
                className="bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700"
              >
                {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Intervalo</label>
              <select
                value={config.interval}
                onChange={e => setConfig({ interval: e.target.value })}
                className="bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700"
              >
                {INTERVALS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <button
              onClick={handleFetchData}
              disabled={isLoadingCandles}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors disabled:opacity-50"
            >
              {isLoadingCandles ? '⟳ Cargando…' : '⬇ Cargar datos'}
            </button>
            {dataSource && (
              <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                dataSource === 'cache' ? 'bg-slate-700 text-slate-400' :
                dataSource === 'demo'  ? 'bg-amber-900/50 text-amber-400' :
                'bg-emerald-900/50 text-emerald-400'
              }`}>
                {dataSource.toUpperCase()}
              </span>
            )}
            {candles.length > 0 && (
              <span className="text-xs text-slate-600">{candles.length} velas</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500">Capital €</label>
            <input
              type="number" value={config.capital} min={1000} step={1000}
              onChange={e => setConfig({ capital: Number(e.target.value) })}
              className="w-24 bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700"
            />
          </div>

          {/* Sliders */}
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

          {/* Acciones */}
          <div className="col-span-2 flex gap-3 pt-2">
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
              ['trades',   '📋 Trades'],
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

          {/* Chart area */}
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
