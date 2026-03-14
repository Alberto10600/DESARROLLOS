import { useState, useRef, useEffect, useMemo } from 'react'
import type { Trade, TradeResult, TradeDirection } from '../../types'

interface Props { trades: Trade[] }

const PER_PAGE = 25

// ── P&L Histogram (mini bar chart) ──────────────────────────────────────────
function PnLHistogram({ trades }: { trades: Trade[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || trades.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    // Build histogram buckets
    const pnls = trades.map(t => t.pnl)
    const min = Math.min(...pnls)
    const max = Math.max(...pnls)
    const range = max - min || 1
    const BUCKETS = 40
    const counts = new Array(BUCKETS).fill(0)
    pnls.forEach(p => {
      const idx = Math.min(BUCKETS - 1, Math.floor(((p - min) / range) * BUCKETS))
      counts[idx]++
    })
    const maxCount = Math.max(...counts)

    // Zero line position
    const zeroX = ((0 - min) / range) * w

    // Draw bars
    const barW = w / BUCKETS
    counts.forEach((count, i) => {
      const barH = (count / maxCount) * (h - 4)
      const x = i * barW
      const barMid = (i + 0.5) * barW
      const isPositive = barMid >= zeroX
      ctx.fillStyle = isPositive ? 'rgba(52,211,153,0.6)' : 'rgba(248,113,113,0.6)'
      ctx.fillRect(x + 0.5, h - barH, barW - 1, barH)
    })

    // Zero line
    ctx.strokeStyle = 'rgba(148,163,184,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(zeroX, 0)
    ctx.lineTo(zeroX, h)
    ctx.stroke()

    // Labels
    ctx.fillStyle = 'rgba(100,116,139,0.8)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`${min.toFixed(0)}€`, 2, h - 2)
    ctx.textAlign = 'right'
    ctx.fillText(`${max.toFixed(0)}€`, w - 2, h - 2)
    ctx.textAlign = 'center'
    ctx.fillText('0', zeroX, h - 2)
  }, [trades])

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={80}
      className="w-full h-[80px]"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

// ── Sparkline for mini trend ──────────────────────────────────────────────────
function MiniSparkline({ values }: { values: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || values.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * w,
      y: h - ((v - min) / range) * (h - 2) - 1,
    }))
    const last = values[values.length - 1]
    const first = values[0]
    ctx.strokeStyle = last >= first ? '#34d399' : '#f87171'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.stroke()
  }, [values])
  return <canvas ref={canvasRef} width={40} height={20} className="inline-block align-middle ml-1 opacity-70" />
}

// ── Streak Counter ────────────────────────────────────────────────────────────
function StreakCounter({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return null
  let streak = 1
  const last = trades[trades.length - 1].result
  for (let i = trades.length - 2; i >= 0; i--) {
    if (trades[i].result === last) streak++
    else break
  }
  const isWin = last === 'WIN'
  const isLoss = last === 'LOSS'
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono border ${
      isWin ? 'bg-emerald-900/20 border-emerald-800/50 text-emerald-400' :
      isLoss ? 'bg-red-900/20 border-red-800/50 text-red-400' :
      'bg-amber-900/20 border-amber-800/50 text-amber-400'
    }`}>
      <span>{isWin ? '🟢' : isLoss ? '🔴' : '🟡'}</span>
      <span>Racha actual: <strong>{streak}</strong> {last}</span>
    </div>
  )
}

export function TradesTable({ trades }: Props) {
  const [page, setPage] = useState(0)
  const [filterResult, setFilterResult] = useState<'ALL' | TradeResult>('ALL')
  const [filterDir, setFilterDir] = useState<'ALL' | TradeDirection>('ALL')
  const [filterYear, setFilterYear] = useState<'ALL' | number>('ALL')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'date' | 'pnl' | 'pnlR' | 'mae' | 'mfe'>('date')
  const [sortAsc, setSortAsc] = useState(false)

  // Derive available years
  const years = useMemo(() => {
    const ys = [...new Set(trades.map(t => t.year))].sort()
    return ys
  }, [trades])

  // Filtered + sorted trades
  const filtered = useMemo(() => {
    let result = trades
    if (filterResult !== 'ALL') result = result.filter(t => t.result === filterResult)
    if (filterDir !== 'ALL') result = result.filter(t => t.direction === filterDir)
    if (filterYear !== 'ALL') result = result.filter(t => t.year === filterYear)
    if (search.trim()) {
      const s = search.toLowerCase()
      result = result.filter(t =>
        t.date.includes(s) || t.result.toLowerCase().includes(s) || t.direction.toLowerCase().includes(s)
      )
    }
    result = [...result].sort((a, b) => {
      let va: number, vb: number
      if (sortKey === 'date') { va = a.id; vb = b.id }
      else { va = a[sortKey]; vb = b[sortKey] }
      return sortAsc ? va - vb : vb - va
    })
    return result
  }, [trades, filterResult, filterDir, filterYear, search, sortKey, sortAsc])

  // Reset page on filter change
  useEffect(() => { setPage(0) }, [filterResult, filterDir, filterYear, search, sortKey, sortAsc])

  const total = Math.ceil(filtered.length / PER_PAGE)
  const slice = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  // Quick summary by direction
  const longTrades = filtered.filter(t => t.direction === 'LONG')
  const shortTrades = filtered.filter(t => t.direction === 'SHORT')
  const longWR = longTrades.length ? (longTrades.filter(t => t.result === 'WIN').length / longTrades.length) * 100 : 0
  const shortWR = shortTrades.length ? (shortTrades.filter(t => t.result === 'WIN').length / shortTrades.length) * 100 : 0
  const longAvgPnL = longTrades.length ? longTrades.reduce((a, t) => a + t.pnl, 0) / longTrades.length : 0
  const shortAvgPnL = shortTrades.length ? shortTrades.reduce((a, t) => a + t.pnl, 0) / shortTrades.length : 0

  // Equity sparkline data (last 50 trades of filtered)
  const equityPoints = filtered.slice(-50).map(t => t.equity)

  // Sort handler
  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }
  const sortIndicator = (key: typeof sortKey) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['#', 'Fecha', 'Dirección', 'Resultado', 'Entry', 'SL', 'TP1', 'TP2', 'P&L €', 'P&L R', 'MAE', 'MFE', 'Equity']
    const rows = filtered.map(t => [
      t.id, t.date.slice(0, 10), t.direction, t.result,
      t.entry.toFixed(2), t.sl.toFixed(2), t.tp1.toFixed(2), t.tp2.toFixed(2),
      t.pnl.toFixed(2), t.pnlR.toFixed(3), t.mae.toFixed(2), t.mfe.toFixed(2),
      t.equity.toFixed(2)
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Page number buttons (show max 7)
  const pageButtons = useMemo(() => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i)
    if (page <= 3) return [0, 1, 2, 3, 4, -1, total - 1]
    if (page >= total - 4) return [0, -1, total - 5, total - 4, total - 3, total - 2, total - 1]
    return [0, -1, page - 1, page, page + 1, -2, total - 1]
  }, [page, total])

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Filtros ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 pb-2 border-b border-slate-800">
        {/* Result filter */}
        <select
          value={filterResult}
          onChange={e => setFilterResult(e.target.value as 'ALL' | TradeResult)}
          className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded border border-slate-700 cursor-pointer"
        >
          <option value="ALL">Todos</option>
          <option value="WIN">WIN</option>
          <option value="LOSS">LOSS</option>
          <option value="PARTIAL">PARTIAL</option>
        </select>

        {/* Direction filter */}
        <div className="flex rounded overflow-hidden border border-slate-700">
          {(['ALL', 'LONG', 'SHORT'] as const).map(d => (
            <button key={d} onClick={() => setFilterDir(d)}
              className={`px-2 py-1 text-xs transition-colors ${
                filterDir === d
                  ? d === 'LONG' ? 'bg-emerald-700/40 text-emerald-300' :
                    d === 'SHORT' ? 'bg-red-700/40 text-red-300' :
                    'bg-slate-600 text-slate-200'
                  : 'bg-slate-800 text-slate-500 hover:text-slate-300'
              }`}
            >
              {d === 'ALL' ? 'ALL' : d === 'LONG' ? '▲ LONG' : '▼ SHORT'}
            </button>
          ))}
        </div>

        {/* Year filter */}
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
          className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded border border-slate-700 cursor-pointer"
        >
          <option value="ALL">Todos los años</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Search */}
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded border border-slate-700 w-24"
        />

        {/* Sort */}
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as typeof sortKey)}
          className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded border border-slate-700 cursor-pointer"
        >
          <option value="date">Fecha</option>
          <option value="pnl">P&L €</option>
          <option value="pnlR">P&L R</option>
          <option value="mae">MAE</option>
          <option value="mfe">MFE</option>
        </select>

        <span className="text-xs text-slate-500 ml-auto">
          <span className="text-slate-300 font-semibold">{filtered.length}</span> trades
        </span>

        {/* Export CSV */}
        <button
          onClick={handleExportCSV}
          className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded border border-slate-600 transition-colors"
        >
          ↓ CSV
        </button>
      </div>

      {/* ── P&L Histogram ────────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="px-3 pt-2 pb-1 border-b border-slate-800 bg-[#070d1a]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-600 uppercase tracking-wider">Distribución P&L</span>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="text-emerald-400/70">■</span> Positivo
              <span className="text-red-400/70">■</span> Negativo
            </div>
          </div>
          <PnLHistogram trades={filtered} />
        </div>
      )}

      {/* ── Resumen Rápido ────────────────────────────────────────────────────── */}
      <div className="flex gap-4 px-3 py-2 border-b border-slate-800 text-xs bg-[#070d1a]">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-semibold">▲ LONG</span>
          <span className="text-slate-400">{longTrades.length} trades</span>
          <span className="text-slate-500">WR: <span className={longWR > 50 ? 'text-emerald-400' : 'text-slate-300'}>{longWR.toFixed(1)}%</span></span>
          <span className="text-slate-500">Avg P&L: <span className={longAvgPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}>{longAvgPnL >= 0 ? '+' : ''}€{longAvgPnL.toFixed(0)}</span></span>
        </div>
        <div className="w-px bg-slate-800" />
        <div className="flex items-center gap-3">
          <span className="text-red-400 font-semibold">▼ SHORT</span>
          <span className="text-slate-400">{shortTrades.length} trades</span>
          <span className="text-slate-500">WR: <span className={shortWR > 50 ? 'text-emerald-400' : 'text-slate-300'}>{shortWR.toFixed(1)}%</span></span>
          <span className="text-slate-500">Avg P&L: <span className={shortAvgPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}>{shortAvgPnL >= 0 ? '+' : ''}€{shortAvgPnL.toFixed(0)}</span></span>
        </div>
        {equityPoints.length > 1 && (
          <div className="ml-auto flex items-center gap-1 text-slate-500">
            <span>Equity (últimos {equityPoints.length}):</span>
            <MiniSparkline values={equityPoints} />
          </div>
        )}
      </div>

      {/* ── Tabla ────────────────────────────────────────────────────────────── */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-[#070d1a] z-10">
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="text-left py-2 px-2 font-medium text-slate-600">#</th>
              <th className="text-left py-2 px-2 font-medium cursor-pointer hover:text-slate-300 select-none"
                  onClick={() => handleSort('date')}>Fecha{sortIndicator('date')}</th>
              <th className="text-left py-2 px-2 font-medium">Dir</th>
              <th className="text-left py-2 px-2 font-medium">Resultado</th>
              <th className="text-left py-2 px-2 font-medium">Entry</th>
              <th className="text-left py-2 px-2 font-medium">SL</th>
              <th className="text-left py-2 px-2 font-medium">TP1</th>
              <th className="text-left py-2 px-2 font-medium">TP2</th>
              <th className="text-left py-2 px-2 font-medium cursor-pointer hover:text-slate-300 select-none"
                  onClick={() => handleSort('pnl')}>P&L €{sortIndicator('pnl')}</th>
              <th className="text-left py-2 px-2 font-medium cursor-pointer hover:text-slate-300 select-none"
                  onClick={() => handleSort('pnlR')}>P&L R{sortIndicator('pnlR')}</th>
              <th className="text-left py-2 px-2 font-medium cursor-pointer hover:text-slate-300 select-none"
                  onClick={() => handleSort('mae')}>MAE{sortIndicator('mae')}</th>
              <th className="text-left py-2 px-2 font-medium cursor-pointer hover:text-slate-300 select-none"
                  onClick={() => handleSort('mfe')}>MFE{sortIndicator('mfe')}</th>
              <th className="text-left py-2 px-2 font-medium">RR Real</th>
              <th className="text-left py-2 px-2 font-medium">Equity</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(t => {
              const rrReal = t.mae !== 0 ? (t.mfe / Math.abs(t.mae)).toFixed(2) : '—'
              const rowBg =
                t.result === 'WIN' ? 'bg-emerald-950/20 hover:bg-emerald-950/40' :
                t.result === 'LOSS' ? 'bg-red-950/20 hover:bg-red-950/40' :
                'bg-amber-950/20 hover:bg-amber-950/40'
              return (
                <tr key={t.id} className={`border-b border-slate-800/30 transition-colors ${rowBg}`}>
                  <td className="py-1.5 px-2 text-slate-600">{t.id}</td>
                  <td className="py-1.5 px-2 text-slate-400">{t.date.slice(0, 10)}</td>
                  <td className="py-1.5 px-2">
                    <span className={t.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}>
                      {t.direction === 'LONG' ? '▲' : '▼'} {t.direction}
                    </span>
                  </td>
                  <td className="py-1.5 px-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      t.result === 'WIN' ? 'bg-emerald-900/50 text-emerald-400' :
                      t.result === 'LOSS' ? 'bg-red-900/50 text-red-400' :
                      'bg-amber-900/50 text-amber-400'
                    }`}>
                      {t.result}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-slate-300">{t.entry.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-red-400/70">{t.sl.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-emerald-400/50">{t.tp1.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-emerald-400/70">{t.tp2.toFixed(2)}</td>
                  <td className={`py-1.5 px-2 font-semibold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                  </td>
                  <td className={`py-1.5 px-2 ${t.pnlR >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                    {t.pnlR >= 0 ? '+' : ''}{t.pnlR.toFixed(2)}R
                  </td>
                  <td className="py-1.5 px-2 text-red-400/60">{t.mae.toFixed(1)}</td>
                  <td className="py-1.5 px-2 text-emerald-400/60">{t.mfe.toFixed(1)}</td>
                  <td className="py-1.5 px-2 text-slate-400">{rrReal}</td>
                  <td className="py-1.5 px-2 text-amber-400/80">
                    €{t.equity.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              )
            })}
            {slice.length === 0 && (
              <tr>
                <td colSpan={14} className="py-8 text-center text-slate-600">
                  No hay trades con los filtros actuales
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer: Paginación + Racha ────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-3 border-t border-slate-800 gap-3 flex-wrap">
        <StreakCounter trades={filtered} />

        {total > 1 && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              disabled={page === 0}
              onClick={() => setPage(0)}
              className="px-2 py-1 text-xs bg-slate-800 text-slate-400 rounded disabled:opacity-30 hover:bg-slate-700"
            >
              «
            </button>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 text-xs bg-slate-800 text-slate-400 rounded disabled:opacity-30 hover:bg-slate-700"
            >
              ‹
            </button>
            {pageButtons.map((p, i) =>
              p < 0 ? (
                <span key={`ellipsis-${i}`} className="px-1 text-slate-600 text-xs">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    page === p
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {p + 1}
                </button>
              )
            )}
            <button
              disabled={page >= total - 1}
              onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 text-xs bg-slate-800 text-slate-400 rounded disabled:opacity-30 hover:bg-slate-700"
            >
              ›
            </button>
            <button
              disabled={page >= total - 1}
              onClick={() => setPage(total - 1)}
              className="px-2 py-1 text-xs bg-slate-800 text-slate-400 rounded disabled:opacity-30 hover:bg-slate-700"
            >
              »
            </button>
            <span className="text-xs text-slate-600 ml-1">
              {page + 1}/{total} · {PER_PAGE}/pág
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
