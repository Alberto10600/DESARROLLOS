import { useStore } from '../store'
import type { Page } from '../types'

interface NavItem {
  id:    Page
  label: string
  icon:  string
  group: string
}

const NAV: NavItem[] = [
  { id: 'workspace', label: 'Workspace',  icon: '◈', group: 'Research'     },
  { id: 'validate',  label: 'Validate',   icon: '◇', group: 'Research'     },
  { id: 'deploy',    label: 'Deploy',     icon: '▶', group: 'Live Trading'  },
  { id: 'monitor',   label: 'Monitor',    icon: '◉', group: 'Live Trading'  },
]

const GROUPS = ['Research', 'Live Trading']

export function Sidebar() {
  const { page, setPage, engine } = useStore()

  return (
    <aside className="w-48 flex-shrink-0 bg-[#070d1a] border-r border-slate-800/60 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-lg font-bold tracking-tight">AURUM</span>
          <span className="text-[10px] text-slate-700 border border-slate-800 px-1.5 py-0.5 rounded font-mono">v2</span>
        </div>
        <p className="text-[10px] text-slate-700 mt-0.5">Donchian · ATR · VolTarget</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-4">
        {GROUPS.map(group => (
          <div key={group}>
            <p className="px-3 mb-1 text-[10px] text-slate-700 uppercase tracking-widest">{group}</p>
            <div className="space-y-0.5">
              {NAV.filter(n => n.group === group).map(item => (
                <button key={item.id} onClick={() => setPage(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors text-left ${
                    page === item.id
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}>
                  <span className="text-[11px]">{item.icon}</span>
                  {item.label}
                  {item.id === 'monitor' && engine.connected && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* IBKR status */}
      <div className="px-4 py-4 border-t border-slate-800/60">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${engine.connected ? 'bg-emerald-500' : 'bg-slate-700'}`} />
          <span className="text-[11px] text-slate-500">
            {engine.connected ? `IBKR · ${engine.account || 'Conectado'}` : 'IBKR · offline'}
          </span>
        </div>
        {engine.connected && (
          <>
            <p className="text-[10px] text-slate-600 font-mono pl-3.5">
              €{engine.equity.toLocaleString('es-ES', { maximumFractionDigits: 0 })}
            </p>
            <p className={`text-[10px] font-mono pl-3.5 ${engine.daily_pnl >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
              {engine.daily_pnl >= 0 ? '+' : ''}€{engine.daily_pnl.toFixed(2)} hoy
            </p>
          </>
        )}
      </div>
    </aside>
  )
}
