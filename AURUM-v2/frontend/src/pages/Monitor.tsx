import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { api } from '../api'

const pnlColor = (v: number) => v >= 0 ? 'text-emerald-400' : 'text-red-400'

export function Monitor() {
  const { engine, setEngine, addLog, log } = useStore()
  const wsRef = useRef<WebSocket | null>(null)

  // Poll engine status every 5 s when connected
  useEffect(() => {
    if (!engine.connected) return
    const poll = async () => {
      try {
        const status = await api.ibkrStatus()
        setEngine(status)
        const positions = await api.ibkrPositions() as typeof engine.positions
        setEngine({ positions })
      } catch { /* engine offline */ }
    }
    poll()
    const id = setInterval(poll, 5_000)
    return () => clearInterval(id)
  }, [engine.connected])

  // WebSocket for real-time log
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`ws://${location.host}/ws`)
      wsRef.current = ws
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          addLog({ time: new Date().toLocaleTimeString(), type: msg.type ?? 'INFO', message: JSON.stringify(msg) })
        } catch { /* ignore */ }
      }
      ws.onclose = () => { setTimeout(connect, 3_000) }
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  const stop = async () => {
    try { await api.stopStrategy() } catch { /* ignore */ }
  }

  const positions = engine.positions ?? []

  if (!engine.connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <div className="text-4xl text-slate-800">◈</div>
        <p className="text-slate-600 text-sm">Engine offline · Conecta IBKR en <span className="text-amber-400">Deploy</span></p>
        <div className="mt-2 w-2 h-2 rounded-full bg-red-500/60 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* KPI bar */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-3 p-4 border-b border-slate-800/60">
        <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Equity</p>
          <p className="text-lg font-bold font-mono text-slate-100">€{engine.equity.toLocaleString('es-ES', { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">P&amp;L Día</p>
          <p className={`text-lg font-bold font-mono ${pnlColor(engine.daily_pnl)}`}>
            {engine.daily_pnl >= 0 ? '+' : ''}€{engine.daily_pnl.toFixed(2)}
          </p>
        </div>
        <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Posiciones</p>
          <p className="text-lg font-bold font-mono text-slate-100">{positions.length}</p>
        </div>
        <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Trades Hoy</p>
          <p className="text-lg font-bold font-mono text-slate-100">{engine.daily_trades}</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Positions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest">Posiciones Abiertas</p>
            <button onClick={stop}
              className="text-[10px] text-red-400 hover:text-red-300 border border-red-900/30 hover:border-red-700/50 px-3 py-1 rounded transition-colors">
              STOP BOT
            </button>
          </div>

          {positions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-700 text-sm gap-2">
              <span className="text-2xl">—</span>
              Sin posiciones abiertas
            </div>
          ) : (
            positions.map(pos => {
              const upnlPct = pos.avg_cost > 0 ? (pos.unrealized_pnl / (Math.abs(pos.position) * pos.avg_cost)) * 100 : 0
              const isLong = pos.position > 0
              return (
                <div key={pos.symbol} className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-sm font-bold text-slate-100">{pos.symbol}</span>
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium ${isLong ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {isLong ? 'LONG' : 'SHORT'}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold font-mono ${pnlColor(pos.unrealized_pnl)}`}>
                        {pos.unrealized_pnl >= 0 ? '+' : ''}€{pos.unrealized_pnl.toFixed(2)}
                      </p>
                      <p className={`text-[10px] font-mono ${pnlColor(upnlPct)}`}>{upnlPct >= 0 ? '+' : ''}{upnlPct.toFixed(2)}%</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-600 block mb-0.5">Tamaño</span>
                      <span className="font-mono text-slate-300">{Math.abs(pos.position).toFixed(4)}</span>
                    </div>
                    <div>
                      <span className="text-slate-600 block mb-0.5">Precio Medio</span>
                      <span className="font-mono text-slate-300">{pos.avg_cost.toFixed(4)}</span>
                    </div>
                  </div>
                  {/* P&L progress bar */}
                  <div className="mt-3">
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pos.unrealized_pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, Math.abs(upnlPct) * 5)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Signal log */}
        <div className="w-80 flex-shrink-0 border-l border-slate-800/60 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest">Signal Log</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono">
            {log.length === 0 ? (
              <p className="text-[11px] text-slate-700 p-2">Esperando señales…</p>
            ) : (
              log.map((entry, i) => (
                <div key={i} className="text-[10px] leading-relaxed">
                  <span className="text-slate-700">{entry.time} </span>
                  <span className={`${entry.type === 'SIGNAL' ? 'text-amber-400' : entry.type === 'TRADE' ? 'text-emerald-400' : entry.type === 'ERROR' ? 'text-red-400' : 'text-slate-500'}`}>
                    [{entry.type}]
                  </span>
                  <span className="text-slate-500"> {entry.message.length > 80 ? entry.message.slice(0, 80) + '…' : entry.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
