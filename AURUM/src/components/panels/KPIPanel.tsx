import { useRef, useEffect } from 'react'
import type { BacktestMetrics } from '../../types'

interface Props {
  metrics: BacktestMetrics
  capital: number
}

// ── Tiny sparkline canvas ──────────────────────────────────────────────────
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
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
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.stroke()
  }, [values, color])
  return (
    <canvas
      ref={ref}
      width={40}
      height={20}
      className="inline-block align-middle opacity-70"
    />
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, sparkValues, sparkColor }: {
  label: string
  value: string
  sub?: string
  color?: string
  sparkValues?: number[]
  sparkColor?: string
}) {
  return (
    <div className="bg-[#070d1a] border border-slate-800/60 rounded-lg p-4 min-w-0">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-end justify-between gap-1">
        <p className={`text-2xl font-bold font-mono truncate ${color ?? 'text-slate-100'}`}>{value}</p>
        {sparkValues && sparkValues.length >= 2 && (
          <Sparkline values={sparkValues} color={sparkColor ?? '#94a3b8'} />
        )}
      </div>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

export function KPIPanel({ metrics, capital }: Props) {
  const returnColor = metrics.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'
  const ddColor = metrics.maxDrawdown > 20 ? 'text-red-400' : metrics.maxDrawdown > 10 ? 'text-amber-400' : 'text-emerald-400'
  const pfColor = metrics.profitFactor > 1.5 ? 'text-emerald-400' : metrics.profitFactor > 1 ? 'text-amber-400' : 'text-red-400'

  // Sparkline data derived from yearly breakdown
  const years = Object.keys(metrics.byYear).map(Number).sort()
  const yearlyReturns = years.map(y => metrics.byYear[y].returnPct)
  const yearlyWR = years.map(y => metrics.byYear[y].winRate)
  const yearlyPnL = years.map(y => metrics.byYear[y].pnl)
  const equityCurveEquity = metrics.equityCurve.map(p => p.equity)
  const equityCurveSlice = equityCurveEquity.length > 40
    ? equityCurveEquity.filter((_, i) => i % Math.floor(equityCurveEquity.length / 40) === 0)
    : equityCurveEquity

  // Best / Worst year by P&L
  let bestYear = '—', worstYear = '—'
  if (years.length > 0) {
    const best = years.reduce((a, b) => metrics.byYear[a].pnl > metrics.byYear[b].pnl ? a : b)
    const worst = years.reduce((a, b) => metrics.byYear[a].pnl < metrics.byYear[b].pnl ? a : b)
    bestYear = `${best} (+${metrics.byYear[best].pnl.toFixed(0)}€)`
    worstYear = `${worst} (${metrics.byYear[worst].pnl.toFixed(0)}€)`
  }

  // Avg win / avg loss ratio
  const wlRatio = metrics.avgLoss !== 0
    ? Math.abs(metrics.avgWin / metrics.avgLoss).toFixed(2)
    : '∞'

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1 */}
      <div className="grid grid-cols-5 gap-3">
        <KPICard
          label="Equity Final"
          value={`€${metrics.finalEquity.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`}
          sub={`Inicial: €${capital.toLocaleString()}`}
          color="text-amber-400"
          sparkValues={equityCurveSlice}
          sparkColor="#f59e0b"
        />
        <KPICard
          label="Retorno Total"
          value={`${metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn.toFixed(1)}%`}
          sub={`CAGR: ${metrics.cagr.toFixed(1)}%/año`}
          color={returnColor}
          sparkValues={yearlyReturns}
          sparkColor={metrics.totalReturn >= 0 ? '#34d399' : '#f87171'}
        />
        <KPICard
          label="Win Rate"
          value={`${metrics.winRate.toFixed(1)}%`}
          sub={`${metrics.wins}W / ${metrics.losses}L / ${metrics.partials}P`}
          color={metrics.winRate > 50 ? 'text-emerald-400' : 'text-slate-300'}
          sparkValues={yearlyWR}
          sparkColor={metrics.winRate > 50 ? '#34d399' : '#94a3b8'}
        />
        <KPICard
          label="Profit Factor"
          value={metrics.profitFactor > 99 ? '∞' : metrics.profitFactor.toFixed(2)}
          sub={`Sharpe ${metrics.sharpeRatio.toFixed(2)} · Sortino ${(metrics.sortinoRatio ?? 0).toFixed(2)}`}
          color={pfColor}
          sparkValues={yearlyPnL}
          sparkColor={metrics.profitFactor > 1.5 ? '#34d399' : metrics.profitFactor > 1 ? '#f59e0b' : '#f87171'}
        />
        <KPICard
          label="Max Drawdown"
          value={`-${metrics.maxDrawdown.toFixed(1)}%`}
          sub={`Duración: ${metrics.maxDrawdownDuration}d`}
          color={ddColor}
          sparkValues={metrics.equityCurve.map(p => p.drawdown).filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 40)) === 0)}
          sparkColor="#f87171"
        />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-3 gap-3">
        <KPICard
          label="Total Trades"
          value={metrics.totalTrades.toString()}
          sub={`Avg €${(metrics.netPnL / (metrics.totalTrades || 1)).toFixed(0)}/trade · Costes: €${(metrics.totalCosts ?? 0).toFixed(0)}`}
          color={metrics.totalTrades >= 30 ? 'text-slate-200' : 'text-amber-400'}
          sparkValues={years.map(y => metrics.byYear[y].trades)}
          sparkColor="#94a3b8"
        />
        <KPICard
          label="Avg Win / Avg Loss"
          value={`${wlRatio}x`}
          sub={`Avg W: +€${metrics.avgWin.toFixed(0)} · Avg L: -€${Math.abs(metrics.avgLoss).toFixed(0)}`}
          color={Number(wlRatio) > 1.5 ? 'text-emerald-400' : Number(wlRatio) > 1 ? 'text-amber-400' : 'text-red-400'}
          sparkValues={yearlyReturns}
          sparkColor={Number(wlRatio) > 1 ? '#34d399' : '#f87171'}
        />
        <KPICard
          label="Mejor / Peor Año"
          value={bestYear}
          sub={`Peor: ${worstYear}`}
          color="text-emerald-400"
          sparkValues={yearlyPnL}
          sparkColor="#f59e0b"
        />
      </div>
    </div>
  )
}
