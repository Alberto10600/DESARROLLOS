import { useAppStore } from '../../store/useAppStore'
import type { AppPage } from '../../types'

interface NavItem {
  id: AppPage
  label: string
  icon: string
  badge?: string
}

const RESEARCH_ITEMS: NavItem[] = [
  { id: 'workspace', label: 'Workspace',  icon: '◎' },
  { id: 'validate',  label: 'Validate',   icon: '⚡', badge: 'WFA' },
  { id: 'trades',    label: 'Trade Log',  icon: '▦' },
]

const LIVE_ITEMS: NavItem[] = [
  { id: 'deploy',  label: 'Deploy',   icon: '▶' },
  { id: 'monitor', label: 'Monitor',  icon: '◈' },
]

const SYSTEM_ITEMS: NavItem[] = [
  { id: 'settings', label: 'Settings', icon: '◌' },
]

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  const { currentPage, setPage } = useAppStore()
  return (
    <div className="mb-4">
      <p className="text-[10px] text-slate-700 uppercase tracking-widest px-3 mb-1 font-medium">{title}</p>
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => setPage(item.id)}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-md mb-0.5
            text-sm font-medium transition-all duration-150
            ${currentPage === item.id
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }
          `}
        >
          <span className="text-base w-4 text-center">{item.icon}</span>
          <span className="flex-1 text-left">{item.label}</span>
          {item.badge && (
            <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono">
              {item.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function Sidebar() {
  const { candles, backtestResult, engineStatus, ibkrConfig } = useAppStore()
  const { ibkrStatus, isEngineRunning, positions, dailyPnl } = engineStatus

  const ibkrColor =
    ibkrStatus === 'connected'   ? 'bg-emerald-400' :
    ibkrStatus === 'connecting'  ? 'bg-amber-400 animate-pulse' :
    ibkrStatus === 'error'       ? 'bg-red-400' :
    'bg-slate-700'

  const ibkrLabel =
    ibkrStatus === 'connected'   ? `IBKR ${ibkrConfig.isPaper ? 'Paper' : 'Live'}` :
    ibkrStatus === 'connecting'  ? 'Conectando…' :
    ibkrStatus === 'error'       ? 'Error IBKR' :
    'Sin conectar'

  return (
    <aside className="w-[200px] flex flex-col border-r border-slate-800/50 bg-[#040810]">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-800/30">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-xl">◈</span>
          <span className="text-slate-100 font-bold tracking-wider text-sm">AURUM</span>
          <span className="text-[10px] text-slate-700 font-mono ml-auto">v1.0</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto">
        <NavSection title="Research" items={RESEARCH_ITEMS} />
        <NavSection title="Live Trading" items={LIVE_ITEMS} />
        <NavSection title="System" items={SYSTEM_ITEMS} />
      </nav>

      {/* Status panel */}
      <div className="p-3 border-t border-slate-800/50 space-y-2">

        {/* IBKR connection status */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ibkrColor}`} />
          <span className="text-xs text-slate-500 truncate">{ibkrLabel}</span>
        </div>

        {/* Python engine status */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isEngineRunning ? 'bg-emerald-400' : 'bg-slate-700'}`} />
          <span className="text-xs text-slate-500">
            {isEngineRunning ? `Engine :${engineStatus.enginePort}` : 'Engine offline'}
          </span>
        </div>

        {/* Active positions / live P&L */}
        {ibkrStatus === 'connected' && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/50">
            <span className="text-xs text-slate-600">{positions.length} pos</span>
            <span className={`text-xs font-mono ml-auto ${dailyPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {dailyPnl >= 0 ? '+' : ''}€{dailyPnl.toFixed(0)} hoy
            </span>
          </div>
        )}

        {/* Data + backtest status */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-800/50">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${candles.length > 0 ? 'bg-amber-400/60' : 'bg-slate-700'}`} />
          <span className="text-[10px] text-slate-600">
            {candles.length > 0
              ? `${candles.length} velas${backtestResult ? ` · ${backtestResult.metrics.totalTrades}T` : ''}`
              : 'Sin datos'}
          </span>
        </div>

      </div>
    </aside>
  )
}
