import { useStore } from '../store'
import { api } from '../api'

const ALL_SYMBOLS = ['XAU/USD', 'BTC/USD', 'EUR/USD', 'NAS100', 'SPY', 'ETH/USD', 'GBP/USD']

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
      {label}
    </span>
  )
}

export function Validate() {
  const { params, interval, start, capital,
          validateSymbols, setValidateSymbols,
          multiResult, setMultiResult,
          isValidating, setValidating } = useStore()

  const toggle = (s: string) => {
    setValidateSymbols(
      validateSymbols.includes(s)
        ? validateSymbols.filter(x => x !== s)
        : [...validateSymbols, s]
    )
  }

  const run = async () => {
    if (validateSymbols.length < 2) return
    setValidating(true)
    try {
      const r = await api.multiAsset({ symbols: validateSymbols, interval, start, capital, params })
      setMultiResult(r as typeof multiResult)
    } finally {
      setValidating(false)
    }
  }

  const r = multiResult
  const robustnessColor = (v: number) =>
    v >= 80 ? 'text-emerald-400' : v >= 60 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="flex h-full">
      {/* Left */}
      <aside className="w-72 flex-shrink-0 border-r border-slate-800/60 p-5 flex flex-col gap-5">
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-3">Activos a Validar</p>
          <div className="space-y-2">
            {ALL_SYMBOLS.map(s => (
              <label key={s} className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" checked={validateSymbols.includes(s)} onChange={() => toggle(s)}
                  className="accent-amber-400 w-3 h-3" />
                <span className={`text-xs transition-colors ${validateSymbols.includes(s) ? 'text-slate-200' : 'text-slate-600 group-hover:text-slate-400'}`}>{s}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-slate-700 mt-3">{validateSymbols.length} activos seleccionados (mín. 2)</p>
        </div>

        <div className="p-3 bg-[#070d1a] border border-slate-800 rounded-lg text-[11px] text-slate-500 space-y-1">
          <p className="text-slate-400 font-medium mb-1">¿Qué valida esto?</p>
          <p>· Mismos params en todos los activos</p>
          <p>· Robustez = % con PF&gt;1 y DD&lt;30%</p>
          <p>· Evita overfitting al activo único</p>
        </div>

        <button onClick={run} disabled={isValidating || validateSymbols.length < 2}
          className="mt-auto w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-bold text-sm rounded-lg transition-colors">
          {isValidating ? 'Validando…' : 'RUN VALIDATION'}
        </button>
      </aside>

      {/* Right */}
      <main className="flex-1 overflow-y-auto p-6">
        {!r ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="text-4xl text-slate-800">◈</div>
            <p className="text-slate-600 text-sm max-w-sm">
              Selecciona 2+ activos y pulsa <span className="text-amber-400">RUN VALIDATION</span>.<br/>
              Se aplican exactamente los mismos parámetros.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4 text-center">
                <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Robustez</p>
                <p className={`text-3xl font-bold font-mono ${robustnessColor(r.robustness)}`}>
                  {r.robustness.toFixed(0)}%
                </p>
                <p className="text-[10px] text-slate-600 mt-1">{r.consistent}/{r.total} activos OK</p>
              </div>
              <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4 text-center">
                <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Score Ponderado</p>
                <p className={`text-3xl font-bold font-mono ${r.weighted_score > 0.5 ? 'text-amber-400' : 'text-slate-400'}`}>
                  {r.weighted_score.toFixed(3)}
                </p>
                <p className="text-[10px] text-slate-600 mt-1">media ponderada por trades</p>
              </div>
              <div className={`border rounded-lg p-4 text-center ${r.robustness >= 75 ? 'bg-emerald-950/20 border-emerald-900/30' : r.robustness >= 50 ? 'bg-amber-950/20 border-amber-900/30' : 'bg-red-950/20 border-red-900/30'}`}>
                <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Veredicto</p>
                <p className={`text-xl font-bold mt-2 ${r.robustness >= 75 ? 'text-emerald-400' : r.robustness >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {r.robustness >= 75 ? 'ROBUSTO' : r.robustness >= 50 ? 'MARGINAL' : 'OVERFITTED'}
                </p>
                <p className="text-[10px] text-slate-600 mt-1">
                  {r.robustness >= 75 ? 'Apto para producción' : r.robustness >= 50 ? 'Revisar parámetros' : 'No desplegar'}
                </p>
              </div>
            </div>

            {/* Asset table */}
            <div className="bg-[#070d1a] border border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800">
                <p className="text-[10px] text-slate-600 uppercase tracking-widest">Resultados por Activo</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-600 uppercase">
                    {['Activo', 'Score', 'Trades', 'Win Rate', 'Profit Factor', 'Max DD', 'Sharpe', 'CAGR', 'Estado'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.assets.map(a => {
                    const ok = a.profit_factor > 1 && a.max_drawdown < 30
                    return (
                      <tr key={a.symbol} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                        <td className="px-3 py-2 font-medium text-slate-200">{a.symbol}</td>
                        <td className="px-3 py-2 font-mono text-amber-400">{a.score.toFixed(3)}</td>
                        <td className="px-3 py-2 text-slate-400">{a.trades}</td>
                        <td className={`px-3 py-2 font-mono ${a.win_rate > 50 ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {a.win_rate.toFixed(1)}%
                        </td>
                        <td className={`px-3 py-2 font-mono ${a.profit_factor > 1.5 ? 'text-emerald-400' : a.profit_factor > 1 ? 'text-amber-400' : 'text-red-400'}`}>
                          {a.profit_factor > 99 ? '∞' : a.profit_factor.toFixed(2)}
                        </td>
                        <td className={`px-3 py-2 font-mono ${a.max_drawdown > 20 ? 'text-red-400' : a.max_drawdown > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          -{a.max_drawdown.toFixed(1)}%
                        </td>
                        <td className={`px-3 py-2 font-mono ${a.sharpe > 1 ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {a.sharpe.toFixed(2)}
                        </td>
                        <td className={`px-3 py-2 font-mono ${a.cagr > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {a.cagr >= 0 ? '+' : ''}{a.cagr.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2">
                          <Badge ok={ok} label={ok ? 'OK' : 'FAIL'} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Heatmap bars */}
            <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
              <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-4">Score comparativo</p>
              <div className="space-y-3">
                {[...r.assets].sort((a, b) => b.score - a.score).map(a => (
                  <div key={a.symbol} className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400 w-20 text-right">{a.symbol}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className={`h-full rounded-full ${a.score > 0.5 ? 'bg-amber-500' : a.score > 0.3 ? 'bg-amber-500/50' : 'bg-red-500/50'}`}
                        style={{ width: `${Math.min(100, a.score * 100)}%` }} />
                    </div>
                    <span className="font-mono text-amber-400 w-14 text-right">{a.score.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
