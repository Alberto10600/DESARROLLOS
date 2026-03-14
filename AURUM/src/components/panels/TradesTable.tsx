import { useState } from 'react'
import type { Trade } from '../../types'

interface Props { trades: Trade[] }

export function TradesTable({ trades }: Props) {
  const [page, setPage] = useState(0)
  const perPage = 20
  const total = Math.ceil(trades.length / perPage)
  const slice = trades.slice(page * perPage, (page + 1) * perPage)

  return (
    <div className="flex flex-col h-full">
      <div className="overflow-auto flex-1">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-[#070d1a]">
            <tr className="text-slate-500 border-b border-slate-800">
              {['#','Fecha','Dir','Resultado','Entry','SL','TP2','P&L €','P&L R','Equity'].map(h => (
                <th key={h} className="text-left py-2 px-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map(t => (
              <tr key={t.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                <td className="py-1.5 px-3 text-slate-600">{t.id}</td>
                <td className="py-1.5 px-3 text-slate-400">{t.date.slice(0, 10)}</td>
                <td className="py-1.5 px-3">
                  <span className={t.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}>
                    {t.direction === 'LONG' ? '▲' : '▼'} {t.direction}
                  </span>
                </td>
                <td className="py-1.5 px-3">
                  <span className={
                    t.result === 'WIN' ? 'text-emerald-400' :
                    t.result === 'LOSS' ? 'text-red-400' : 'text-amber-400'
                  }>
                    {t.result}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-slate-300">{t.entry.toFixed(2)}</td>
                <td className="py-1.5 px-3 text-red-400/70">{t.sl.toFixed(2)}</td>
                <td className="py-1.5 px-3 text-emerald-400/70">{t.tp2.toFixed(2)}</td>
                <td className={`py-1.5 px-3 font-semibold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                </td>
                <td className={`py-1.5 px-3 ${t.pnlR >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                  {t.pnlR >= 0 ? '+' : ''}{t.pnlR.toFixed(2)}R
                </td>
                <td className="py-1.5 px-3 text-amber-400/80">
                  €{t.equity.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-slate-800">
          <span className="text-xs text-slate-500">
            {trades.length} trades · Página {page + 1}/{total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 text-xs bg-slate-800 text-slate-300 rounded disabled:opacity-30"
            >
              ◀
            </button>
            <button
              disabled={page >= total - 1}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 text-xs bg-slate-800 text-slate-300 rounded disabled:opacity-30"
            >
              ▶
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
