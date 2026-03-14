import { useRef, useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { Titlebar } from './components/layout/Titlebar'
import { Sidebar } from './components/layout/Sidebar'
import { BacktestPage } from './components/BacktestPage'
import { OptimizerPage } from './components/Optimizer/OptimizerPage'
import { TradesTable } from './components/panels/TradesTable'
import { SettingsPage } from './components/SettingsPage'
import { StrategyEditorPage } from './components/StrategyEditor/StrategyEditorPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import type { BacktestMetrics, Trade } from './types'

// ── Mini equity curve canvas ──────────────────────────────────────────────
function MiniEquityCurve({ data, capital }: { data: { date: string; equity: number }[]; capital: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || data.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const values = data.map(p => p.equity)
    const min = Math.min(...values, capital)
    const max = Math.max(...values)
    const range = max - min || 1
    const pts = values.map((v, i) => ({
      x: (i / (values.length - 1)) * w,
      y: h - ((v - min) / range) * (h - 6) - 3,
    }))
    // Fill gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(245,158,11,0.25)')
    grad.addColorStop(1, 'rgba(245,158,11,0.02)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(0, h)
    pts.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
    // Line
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.stroke()
    // Capital baseline
    const zeroY = h - ((capital - min) / range) * (h - 6) - 3
    ctx.strokeStyle = 'rgba(148,163,184,0.2)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, zeroY)
    ctx.lineTo(w, zeroY)
    ctx.stroke()
    ctx.setLineDash([])
  }, [data, capital])
  return <canvas ref={ref} width={600} height={120} className="w-full h-[120px]" />
}

// ── Welcome feature card ───────────────────────────────────────────────────
function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-[#070d1a] border border-slate-800 rounded-xl p-6 flex flex-col gap-3">
      <div className="text-3xl">{icon}</div>
      <h3 className="text-slate-200 font-semibold">{title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
    </div>
  )
}

// ── Metric cell ─────────────────────────────────────────────────────────────
function MetricCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color ?? 'text-slate-100'}`}>{value}</p>
    </div>
  )
}

// ── Last trades quick row ───────────────────────────────────────────────────
function TradeRow({ t }: { t: Trade }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded text-xs font-mono border ${
      t.result === 'WIN'  ? 'bg-emerald-950/20 border-emerald-900/30' :
      t.result === 'LOSS' ? 'bg-red-950/20 border-red-900/30' :
      'bg-amber-950/20 border-amber-900/30'
    }`}>
      <span className="text-slate-600 w-6">{t.id}</span>
      <span className="text-slate-500">{t.date.slice(0, 10)}</span>
      <span className={t.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}>
        {t.direction === 'LONG' ? '▲' : '▼'} {t.direction}
      </span>
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
        t.result === 'WIN'  ? 'bg-emerald-900/50 text-emerald-400' :
        t.result === 'LOSS' ? 'bg-red-900/50 text-red-400' :
        'bg-amber-900/50 text-amber-400'
      }`}>{t.result}</span>
      <span className="ml-auto font-semibold">
        <span className={t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}€
        </span>
        <span className="text-slate-600 ml-2">{t.pnlR >= 0 ? '+' : ''}{t.pnlR.toFixed(2)}R</span>
      </span>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard() {
  const { backtestResult, config, setPage } = useAppStore()

  // No data: welcome screen
  if (!backtestResult) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-8">
        <div className="text-center">
          <div className="text-5xl mb-4 text-amber-400">◈</div>
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Bienvenido a AURUM</h1>
          <p className="text-slate-500 max-w-md">
            Plataforma de backtesting y optimización de estrategias SMC (Smart Money Concepts). Ejecuta tu primera simulación para ver resultados.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 w-full max-w-3xl">
          <FeatureCard
            icon="⚡"
            title="Grid Search"
            desc="Explora miles de combinaciones de parámetros automáticamente para encontrar la configuración óptima de tu estrategia."
          />
          <FeatureCard
            icon="🧠"
            title="Optimización Bayesiana"
            desc="Algoritmo inteligente que aprende de cada evaluación para converger más rápido a los mejores parámetros posibles."
          />
          <FeatureCard
            icon="📊"
            title="Estrategia SMC"
            desc="Order Blocks, estructura de mercado y filtros de sesión (London / NY / Asia) para operar con las instituciones."
          />
        </div>

        <button
          onClick={() => setPage('backtesting')}
          className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg transition-colors"
        >
          Comenzar Backtest ▶
        </button>
      </div>
    )
  }

  // With data: overview dashboard
  const m: BacktestMetrics = backtestResult.metrics
  const trades = backtestResult.trades
  const lastFive = trades.slice(-5).reverse()
  const years = Object.keys(m.byYear).map(Number).sort()
  const bestYear = years.length > 0
    ? years.reduce((a, b) => m.byYear[a].pnl > m.byYear[b].pnl ? a : b)
    : null
  const worstYear = years.length > 0
    ? years.reduce((a, b) => m.byYear[a].pnl < m.byYear[b].pnl ? a : b)
    : null

  return (
    <div className="flex flex-col h-full overflow-auto p-6 gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Resumen del Backtest</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {config.symbol} · {config.interval} · Capital inicial: €{config.capital.toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage('backtesting')}
            className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold rounded transition-colors"
          >
            ▶ Nuevo Backtest
          </button>
          <button
            onClick={() => setPage('optimizer')}
            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
          >
            ⚡ Optimizar
          </button>
          <button
            onClick={() => setPage('trades')}
            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
          >
            📋 Ver Trades
          </button>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCell
          label="Equity Final"
          value={`€${m.finalEquity.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`}
          color="text-amber-400"
        />
        <MetricCell
          label="Retorno Total"
          value={`${m.totalReturn >= 0 ? '+' : ''}${m.totalReturn.toFixed(1)}%`}
          color={m.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <MetricCell
          label="CAGR"
          value={`${m.cagr.toFixed(1)}%/año`}
          color={m.cagr >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <MetricCell
          label="Win Rate"
          value={`${m.winRate.toFixed(1)}%`}
          color={m.winRate > 50 ? 'text-emerald-400' : 'text-slate-300'}
        />
        <MetricCell
          label="Profit Factor"
          value={m.profitFactor > 99 ? '∞' : m.profitFactor.toFixed(2)}
          color={m.profitFactor > 1.5 ? 'text-emerald-400' : m.profitFactor > 1 ? 'text-amber-400' : 'text-red-400'}
        />
        <MetricCell
          label="Max Drawdown"
          value={`-${m.maxDrawdown.toFixed(1)}%`}
          color={m.maxDrawdown > 20 ? 'text-red-400' : m.maxDrawdown > 10 ? 'text-amber-400' : 'text-emerald-400'}
        />
        <MetricCell
          label="Sharpe Ratio"
          value={m.sharpeRatio.toFixed(2)}
          color={m.sharpeRatio > 1 ? 'text-emerald-400' : m.sharpeRatio > 0.5 ? 'text-amber-400' : 'text-red-400'}
        />
        <MetricCell
          label="Total Trades"
          value={m.totalTrades.toString()}
        />
      </div>

      {/* Equity curve + yearly breakdown */}
      <div className="grid grid-cols-3 gap-4">

        {/* Mini equity curve */}
        <div className="col-span-2 bg-[#070d1a] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Curva de Equity</p>
            <span className="text-xs text-amber-400 font-mono">
              €{m.finalEquity.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <MiniEquityCurve data={m.equityCurve} capital={config.capital} />
        </div>

        {/* Year summary */}
        <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Por Año</p>
          <div className="flex flex-col gap-2 overflow-auto flex-1">
            {years.map(y => {
              const ys = m.byYear[y]
              return (
                <div key={y} className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-slate-500 w-10">{y}</span>
                  <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${ys.returnPct >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, Math.abs(ys.returnPct) * 2)}%` }}
                    />
                  </div>
                  <span className={`w-14 text-right ${ys.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {ys.returnPct >= 0 ? '+' : ''}{ys.returnPct.toFixed(1)}%
                  </span>
                  <span className="text-slate-600 w-16 text-right">WR {ys.winRate.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
          {bestYear !== null && worstYear !== null && (
            <div className="pt-2 border-t border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Mejor año</span>
                <span className="text-emerald-400 font-mono">{bestYear} +€{m.byYear[bestYear].pnl.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Peor año</span>
                <span className="text-red-400 font-mono">{worstYear} €{m.byYear[worstYear].pnl.toFixed(0)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Last 5 trades */}
      <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Últimas 5 Operaciones</p>
          <button
            onClick={() => setPage('trades')}
            className="text-xs text-amber-400/70 hover:text-amber-400 transition-colors"
          >
            Ver todas →
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {lastFive.map(t => <TradeRow key={t.id} t={t} />)}
        </div>
      </div>

    </div>
  )
}

export function App() {
  const { currentPage, backtestResult } = useAppStore()

  return (
    <div className="flex flex-col h-screen bg-[#040810] text-slate-200 overflow-hidden">
      <Titlebar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden">
          {currentPage === 'dashboard'   && <ErrorBoundary><Dashboard /></ErrorBoundary>}
          {currentPage === 'backtesting' && <ErrorBoundary><BacktestPage /></ErrorBoundary>}
          {currentPage === 'optimizer'   && <ErrorBoundary><OptimizerPage /></ErrorBoundary>}
          {currentPage === 'trades'      && (
            <ErrorBoundary>
              <div className="h-full overflow-hidden">
                {backtestResult ? (
                  <TradesTable trades={backtestResult.trades} />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-600">
                    Ejecuta un backtest primero
                  </div>
                )}
              </div>
            </ErrorBoundary>
          )}
          {currentPage === 'strategy'    && <ErrorBoundary><StrategyEditorPage /></ErrorBoundary>}
          {currentPage === 'settings'    && <ErrorBoundary><SettingsPage /></ErrorBoundary>}
        </main>
      </div>
    </div>
  )
}
