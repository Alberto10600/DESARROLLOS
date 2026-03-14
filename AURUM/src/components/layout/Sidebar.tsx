import { useAppStore } from '../../store/useAppStore'
import type { AppPage } from '../../types'

interface NavItem {
  id: AppPage
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',   label: 'Dashboard',   icon: '◈' },
  { id: 'backtesting', label: 'Backtesting', icon: '◎' },
  { id: 'optimizer',   label: 'Optimizer',   icon: '⚡' },
  { id: 'trades',      label: 'Trades Log',  icon: '▦' },
  { id: 'settings',    label: 'Settings',    icon: '◌' },
]

export function Sidebar() {
  const { currentPage, setPage, candles, backtestResult } = useAppStore()

  return (
    <aside className="w-[220px] flex flex-col border-r border-slate-800/50 bg-[#040810]">
      {/* Nav items */}
      <nav className="flex-1 py-4 px-2">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-md mb-1
              text-sm font-medium transition-all duration-150
              ${currentPage === item.id
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'
              }
            `}
          >
            <span className="text-base w-4 text-center">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'optimizer' && (
              <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono">
                BO
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Status bar */}
      <div className="p-3 border-t border-slate-800/50">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${candles.length > 0 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          <span className="text-xs text-slate-500">
            {candles.length > 0 ? `${candles.length} velas` : 'Sin datos'}
          </span>
        </div>
        {backtestResult && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs text-slate-500">
              {backtestResult.metrics.totalTrades} trades
            </span>
          </div>
        )}
        <p className="text-[10px] text-slate-700 mt-2">AURUM v1.0.0</p>
      </div>
    </aside>
  )
}
