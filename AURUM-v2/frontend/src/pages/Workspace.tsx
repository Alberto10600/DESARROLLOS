import { useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { Slider } from '../components/ui/Slider'
import { StatCard } from '../components/ui/StatCard'
import { EquityChart } from '../components/charts/EquityChart'
import type { BacktestResult } from '../types'

const SYMBOLS  = ['XAU/USD', 'BTC/USD', 'EUR/USD', 'NAS100', 'SPY', 'ETH/USD', 'GBP/USD']
const INTERVALS = [{ v: '1day', l: '1D' }, { v: '4h', l: '4H' }, { v: '1h', l: '1H' }, { v: '30min', l: '30M' }]

export function Workspace() {
  const { symbol, interval, start, capital, params,
          setSymbol, setInterval, setStart, setCapital, setParams,
          result, setResult, isRunning, setRunning } = useStore()

  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'equity' | 'trades' | 'years'>('equity')

  const run = async () => {
    setRunning(true); setError(null)
    try {
      const r = await api.backtest({ symbol, interval, start, capital, params }) as BacktestResult
      setResult(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setRunning(false)
    }
  }

  const m = result?.metrics
  const pnlColor = (v: number) => v >= 0 ? 'text-emerald-400' : 'text-red-400'
  const pfColor  = (v: number) => v > 1.5 ? 'text-emerald-400' : v > 1 ? 'text-amber-400' : 'text-red-400'
  const ddColor  = (v: number) => v > 20 ? 'text-red-400' : v > 10 ? 'text-amber-400' : 'text-emerald-400'

  return (
    <div className="flex h-full">
      {/* Left: Config panel */}
      <aside className="w-72 flex-shrink-0 border-r border-slate-800/60 p-5 flex flex-col gap-5 overflow-y-auto">
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-3">Datos</p>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-slate-600 block mb-1">Activo</label>
              <select value={symbol} onChange={e => setSymbol(e.target.value)}
                className="w-full bg-[#070d1a] border border-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded">
                {SYMBOLS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-1">
              {INTERVALS.map(iv => (
                <button key={iv.v} onClick={() => setInterval(iv.v)}
                  className={`flex-1 py-1 text-xs rounded border transition-colors ${
                    interval === iv.v ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'border-slate-800 text-slate-600 hover:text-slate-300'
                  }`}>{iv.l}</button>
              ))}
            </div>
            <div>
              <label className="text-[10px] text-slate-600 block mb-1">Desde</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)}
                className="w-full bg-[#070d1a] border border-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded" />
            </div>
            <div>
              <label className="text-[10px] text-slate-600 block mb-1">Capital (€)</label>
              <input type="number" value={capital} min={1000} step={1000}
                onChange={e => setCapital(Number(e.target.value))}
                className="w-full bg-[#070d1a] border border-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded font-mono" />
            </div>
          </div>
        </div>

        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-3">Estrategia</p>
          <div className="space-y-4">
            <Slider label="Donchian Period"    value={params.breakout_period} min={10} max={50} step={1}   onChange={v => setParams({ breakout_period: v })} />
            <Slider label="ATR Period"         value={params.atr_period}      min={7}  max={28} step={1}   onChange={v => setParams({ atr_period: v })} />
            <Slider label="SL (ATR múltiplo)"  value={params.atr_sl_mult}     min={1}  max={4}  step={0.25} decimals={2} onChange={v => setParams({ atr_sl_mult: v })} />
            <Slider label="TP Risk:Reward"     value={params.tp_rr}           min={1.5} max={6} step={0.5} decimals={1} onChange={v => setParams({ tp_rr: v })} />
            <Slider label="Vol Target (%/año)" value={params.target_vol_pct}  min={5}  max={40} step={1}   unit="%" decimals={0} onChange={v => setParams({ target_vol_pct: v })} />
            <Slider label="EMA Filter (0=off)" value={params.ema_filter}      min={0}  max={200} step={10} onChange={v => setParams({ ema_filter: v })} />
          </div>
        </div>

        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-3">Costes IBKR</p>
          <div className="space-y-4">
            <Slider label="Slippage (%)"   value={params.slippage_pct} min={0} max={0.5} step={0.01} decimals={2} onChange={v => setParams({ slippage_pct: v })} />
            <Slider label="Comisión (€/T)" value={params.commission}   min={0} max={20}  step={0.5}  decimals={1} onChange={v => setParams({ commission: v })} />
          </div>
        </div>

        <button onClick={run} disabled={isRunning}
          className="mt-auto w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-bold text-sm rounded-lg transition-colors">
          {isRunning ? 'Ejecutando…' : 'RUN BACKTEST'}
        </button>
      </aside>

      {/* Right: Results */}
      <main className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-950/40 border border-red-900/40 text-red-400 text-xs rounded-lg">{error}</div>
        )}

        {!result ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="text-4xl text-slate-800">◈</div>
            <p className="text-slate-600 text-sm max-w-sm">
              Configura la estrategia y pulsa <span className="text-amber-400">RUN BACKTEST</span>.<br/>
              Los datos se descargan automáticamente.
            </p>
            <div className="mt-4 p-4 bg-[#070d1a] border border-slate-800 rounded-lg text-xs text-slate-500 max-w-md text-left space-y-1">
              <p className="text-slate-400 font-medium mb-2">Estrategia: Donchian Breakout + Volatility Targeting</p>
              <p>· Señal: rotura del canal N-periodos (momentum probado 40+ años)</p>
              <p>· Stop: N × ATR dinámico (se ajusta a la volatilidad actual)</p>
              <p>· Sizing: vol targeting — mismo riesgo en puntos de vol, no % fijo</p>
              <p>· Filtro EMA: opcional, para reducir trades en mercados laterales</p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-100">{symbol} · {interval}</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Score: <span className="text-amber-400 font-mono">{result.score.toFixed(4)}</span>
                  {' · '}Fuente: <span className="text-slate-400">{result.source}</span>
                  {' · '}{m!.total_trades} trades
                </p>
              </div>
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Equity Final"  value={`€${m!.final_equity.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`} color="text-amber-400" />
              <StatCard label="Retorno Total" value={`${m!.total_return >= 0 ? '+' : ''}${m!.total_return.toFixed(1)}%`} color={pnlColor(m!.total_return)} sub={`CAGR ${m!.cagr.toFixed(1)}%/año`} />
              <StatCard label="Max Drawdown"  value={`-${m!.max_drawdown.toFixed(1)}%`} color={ddColor(m!.max_drawdown)} sub={`${m!.max_dd_duration}d duración`} />
              <StatCard label="Profit Factor" value={m!.profit_factor > 99 ? '∞' : m!.profit_factor.toFixed(2)} color={pfColor(m!.profit_factor)} sub={`Sharpe ${m!.sharpe.toFixed(2)} · Sortino ${m!.sortino.toFixed(2)}`} />
              <StatCard label="Win Rate"      value={`${m!.win_rate.toFixed(1)}%`} sub={`${m!.wins}W / ${m!.losses}L`} color={m!.win_rate > 50 ? 'text-emerald-400' : 'text-slate-300'} />
              <StatCard label="Calmar Ratio"  value={m!.calmar.toFixed(2)} color={m!.calmar > 1 ? 'text-emerald-400' : m!.calmar > 0.5 ? 'text-amber-400' : 'text-red-400'} />
              <StatCard label="Avg RR"        value={`${m!.avg_rr.toFixed(2)}R`} />
              <StatCard label="Costes Total"  value={`€${m!.total_costs.toFixed(0)}`} color="text-slate-400" sub={`${((m!.total_costs / m!.net_pnl) * 100).toFixed(1)}% del PnL`} />
            </div>

            {/* Tab strip */}
            <div className="flex gap-1 border-b border-slate-800">
              {(['equity', 'trades', 'years'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 text-xs font-medium transition-colors ${
                    tab === t ? 'text-amber-400 border-b border-amber-400' : 'text-slate-600 hover:text-slate-300'
                  }`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
              ))}
            </div>

            {tab === 'equity' && (
              <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest">Equity Curve + Drawdown</p>
                  <span className="text-[10px] text-slate-600">{m!.equity_curve.length} puntos</span>
                </div>
                <EquityChart data={m!.equity_curve} capital={capital} />
              </div>
            )}

            {tab === 'years' && (
              <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
                <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-3">Desglose Anual</p>
                <div className="space-y-2">
                  {Object.values(m!.by_year).sort((a, b) => a.year - b.year).map(y => (
                    <div key={y.year} className="flex items-center gap-3 text-xs">
                      <span className="text-slate-500 font-mono w-12">{y.year}</span>
                      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${y.return_pct >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, Math.abs(y.return_pct) * 2)}%` }} />
                      </div>
                      <span className={`w-16 text-right font-mono ${y.return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {y.return_pct >= 0 ? '+' : ''}{y.return_pct.toFixed(1)}%
                      </span>
                      <span className="text-slate-600 w-20 text-right">{y.trades}T · WR {y.win_rate.toFixed(0)}%</span>
                      <span className={`w-20 text-right font-mono ${y.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {y.pnl >= 0 ? '+' : ''}€{y.pnl.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'trades' && (
              <div className="bg-[#070d1a] border border-slate-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] text-slate-600 uppercase">
                        {['#', 'Dir', 'Entry Date', 'Exit Date', 'Entry', 'SL', 'TP', 'R', 'PnL', 'Result'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map(t => (
                        <tr key={t.id} className={`border-b border-slate-800/50 hover:bg-slate-800/20 ${
                          t.result === 'WIN' ? 'text-emerald-400/80' : 'text-red-400/80'
                        }`}>
                          <td className="px-3 py-1.5 text-slate-600">{t.id}</td>
                          <td className={`px-3 py-1.5 font-medium ${t.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>{t.direction}</td>
                          <td className="px-3 py-1.5 text-slate-400 font-mono">{t.entry_date.slice(0,10)}</td>
                          <td className="px-3 py-1.5 text-slate-400 font-mono">{t.exit_date.slice(0,10)}</td>
                          <td className="px-3 py-1.5 font-mono">{t.entry.toFixed(4)}</td>
                          <td className="px-3 py-1.5 font-mono text-red-400/60">{t.sl.toFixed(4)}</td>
                          <td className="px-3 py-1.5 font-mono text-emerald-400/60">{t.tp.toFixed(4)}</td>
                          <td className="px-3 py-1.5 font-mono">{t.pnl_r.toFixed(2)}R</td>
                          <td className={`px-3 py-1.5 font-mono font-medium ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.pnl >= 0 ? '+' : ''}€{t.pnl.toFixed(2)}
                          </td>
                          <td className={`px-3 py-1.5 font-bold text-[10px] ${t.result === 'WIN' ? 'text-emerald-400' : 'text-red-400'}`}>{t.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
