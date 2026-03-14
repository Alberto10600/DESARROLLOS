import type { BacktestMetrics } from '../../types'

interface Props {
  metrics: BacktestMetrics
  capital: number
}

function KPICard({ label, value, sub, color }: {
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-[#070d1a] border border-slate-800/60 rounded-lg p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color ?? 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

export function KPIPanel({ metrics, capital }: Props) {
  const returnColor = metrics.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'
  const ddColor     = metrics.maxDrawdown > 20 ? 'text-red-400' : metrics.maxDrawdown > 10 ? 'text-amber-400' : 'text-emerald-400'

  return (
    <div className="grid grid-cols-5 gap-3 mb-4">
      <KPICard
        label="Equity Final"
        value={`€${metrics.finalEquity.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`}
        sub={`Inicial: €${capital.toLocaleString()}`}
        color="text-amber-400"
      />
      <KPICard
        label="Retorno Total"
        value={`${metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn.toFixed(1)}%`}
        sub={`CAGR: ${metrics.cagr.toFixed(1)}%/año`}
        color={returnColor}
      />
      <KPICard
        label="Win Rate"
        value={`${metrics.winRate.toFixed(1)}%`}
        sub={`${metrics.wins}W / ${metrics.losses}L / ${metrics.partials}P`}
        color={metrics.winRate > 50 ? 'text-emerald-400' : 'text-slate-300'}
      />
      <KPICard
        label="Profit Factor"
        value={metrics.profitFactor > 99 ? '∞' : metrics.profitFactor.toFixed(2)}
        sub={`Sharpe: ${metrics.sharpeRatio.toFixed(2)}`}
        color={metrics.profitFactor > 1.5 ? 'text-emerald-400' : metrics.profitFactor > 1 ? 'text-amber-400' : 'text-red-400'}
      />
      <KPICard
        label="Max Drawdown"
        value={`-${metrics.maxDrawdown.toFixed(1)}%`}
        sub={`Duración: ${metrics.maxDrawdownDuration}d`}
        color={ddColor}
      />
    </div>
  )
}
