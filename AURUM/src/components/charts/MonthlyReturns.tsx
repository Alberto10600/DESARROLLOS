/**
 * MonthlyReturns — Heatmap de retornos mensuales (año × mes)
 * Muestra el P&L porcentual de cada mes con colores:
 *   verde: positivo, rojo: negativo, gris: sin trades
 */

import type { Trade } from '../../types'

interface Props {
  trades: Trade[]
  initialCapital: number
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export function MonthlyReturns({ trades, initialCapital }: Props) {
  if (trades.length === 0) return null

  // ── Agrupar P&L por año-mes ──────────────────────────────────────────────
  const monthly: Record<number, Record<number, { pnl: number; n: number }>> = {}

  let equityAtMonthStart: Record<string, number> = {}
  let runningEquity = initialCapital

  for (const t of trades) {
    const d = new Date(t.date)
    const y = d.getFullYear()
    const m = d.getMonth() // 0-based
    const key = `${y}-${m}`

    if (!equityAtMonthStart[key]) equityAtMonthStart[key] = runningEquity
    if (!monthly[y]) monthly[y] = {}
    if (!monthly[y][m]) monthly[y][m] = { pnl: 0, n: 0 }
    monthly[y][m].pnl += t.pnl
    monthly[y][m].n++
    runningEquity += t.pnl
  }

  const years = Object.keys(monthly).map(Number).sort()

  // ── Calcular estadísticas ─────────────────────────────────────────────────
  const allPcts: number[] = []
  for (const y of years) {
    for (let m = 0; m < 12; m++) {
      const cell = monthly[y]?.[m]
      if (!cell) continue
      const key = `${y}-${m}`
      const startEq = equityAtMonthStart[key] ?? initialCapital
      if (startEq > 0) allPcts.push((cell.pnl / startEq) * 100)
    }
  }

  const positiveMonths = allPcts.filter(p => p > 0).length
  const totalMonths = allPcts.length
  const avgMonthlyReturn = totalMonths > 0 ? allPcts.reduce((s, p) => s + p, 0) / totalMonths : 0
  const bestMonth = totalMonths > 0 ? Math.max(...allPcts) : 0
  const worstMonth = totalMonths > 0 ? Math.min(...allPcts) : 0

  // ── Color de celda ────────────────────────────────────────────────────────
  function cellColor(pct: number): string {
    if (Math.abs(pct) < 0.01) return 'bg-slate-800 text-slate-600'
    const intensity = Math.min(Math.abs(pct) / 8, 1) // satura en ±8%
    if (pct > 0) {
      const g = Math.round(80 + intensity * 120)
      return `bg-[rgba(16,${g},64,0.8)] text-emerald-${intensity > 0.5 ? '300' : '400'}`
    } else {
      const r = Math.round(100 + intensity * 100)
      return `bg-[rgba(${r},20,20,0.8)] text-red-${intensity > 0.5 ? '300' : '400'}`
    }
  }

  function cellBg(pct: number): string {
    if (Math.abs(pct) < 0.01) return '#0f172a'
    const intensity = Math.min(Math.abs(pct) / 8, 1)
    if (pct > 0) {
      const g = Math.round(50 + intensity * 100)
      const alpha = 0.3 + intensity * 0.5
      return `rgba(16,${g},48,${alpha})`
    } else {
      const r = Math.round(80 + intensity * 100)
      const alpha = 0.3 + intensity * 0.5
      return `rgba(${r},16,16,${alpha})`
    }
  }

  function textColor(pct: number): string {
    if (Math.abs(pct) < 0.01) return '#334155'
    const intensity = Math.min(Math.abs(pct) / 8, 1)
    if (pct > 0) return intensity > 0.5 ? '#6ee7b7' : '#34d399'
    else return intensity > 0.5 ? '#fca5a5' : '#f87171'
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-4 gap-4">

      {/* ── Stats summary ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {[
          { label: 'Meses positivos', value: `${positiveMonths}/${totalMonths}`, sub: `${totalMonths > 0 ? ((positiveMonths/totalMonths)*100).toFixed(0) : 0}%`, color: 'text-emerald-400' },
          { label: 'Retorno medio/mes', value: `${avgMonthlyReturn >= 0 ? '+' : ''}${avgMonthlyReturn.toFixed(2)}%`, sub: 'promedio mensual', color: avgMonthlyReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Mejor mes', value: `+${bestMonth.toFixed(2)}%`, sub: 'máximo', color: 'text-emerald-300' },
          { label: 'Peor mes', value: `${worstMonth.toFixed(2)}%`, sub: 'mínimo', color: 'text-red-300' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-600">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Heatmap ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs font-mono border-collapse">
          <thead>
            <tr>
              <th className="text-left text-slate-600 py-1.5 pr-4 font-normal">Año</th>
              {MONTHS.map(m => (
                <th key={m} className="text-center text-slate-600 py-1.5 px-1 font-normal">{m}</th>
              ))}
              <th className="text-right text-slate-600 py-1.5 pl-4 font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {years.map(y => {
              const yearPnl = Object.values(monthly[y] ?? {}).reduce((s, v) => s + v.pnl, 0)
              const firstKey = Object.keys(monthly[y] ?? {})[0]
              const startKey = `${y}-${firstKey}`
              const startEq = equityAtMonthStart[startKey] ?? initialCapital
              const yearPct = startEq > 0 ? (yearPnl / startEq) * 100 : 0

              return (
                <tr key={y} className="border-t border-slate-800/40">
                  <td className="text-slate-400 py-1.5 pr-4 font-bold">{y}</td>
                  {Array.from({ length: 12 }, (_, mi) => {
                    const cell = monthly[y]?.[mi]
                    if (!cell) return (
                      <td key={mi} className="py-1 px-0.5">
                        <div className="w-full h-8 rounded bg-slate-900 flex items-center justify-center text-slate-700">
                          —
                        </div>
                      </td>
                    )
                    const key = `${y}-${mi}`
                    const startE = equityAtMonthStart[key] ?? initialCapital
                    const pct = startE > 0 ? (cell.pnl / startE) * 100 : 0
                    return (
                      <td key={mi} className="py-1 px-0.5">
                        <div
                          title={`${MONTHS[mi]} ${y}: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% (${cell.n} trades, €${cell.pnl.toFixed(0)})`}
                          className="w-full h-8 rounded flex flex-col items-center justify-center cursor-default transition-opacity hover:opacity-80"
                          style={{ backgroundColor: cellBg(pct), color: textColor(pct) }}
                        >
                          <span className="font-bold text-[11px]">{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    )
                  })}
                  <td className="py-1.5 pl-4 text-right">
                    <span
                      className="font-bold"
                      style={{ color: textColor(yearPct) }}
                    >
                      {yearPct >= 0 ? '+' : ''}{yearPct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ── Leyenda ───────────────────────────────────────────────────── */}
        <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-500">
          <span>Intensidad de color:</span>
          {[-8,-4,-2,-1,0,1,2,4,8].map(v => (
            <div
              key={v}
              className="w-8 h-4 rounded text-center leading-4 text-[9px]"
              style={{ backgroundColor: cellBg(v), color: textColor(v) }}
            >
              {v > 0 ? `+${v}` : v === 0 ? '0' : v}%
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
