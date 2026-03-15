import { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { LivePosition } from '../types'

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
      <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${color ?? 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function PositionRow({ pos }: { pos: LivePosition }) {
  const pnlColor = pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
  const progress = Math.max(0, Math.min(100,
    pos.direction === 'LONG'
      ? ((pos.currentPrice - pos.entryPrice) / (pos.tp2 - pos.entryPrice)) * 100
      : ((pos.entryPrice - pos.currentPrice) / (pos.entryPrice - pos.tp2)) * 100
  ))

  return (
    <div className="bg-[#0a1020] border border-slate-800/60 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-sm font-bold text-slate-200">{pos.symbol}</span>
          <span className={`ml-2 text-xs font-mono px-1.5 py-0.5 rounded ${
            pos.direction === 'LONG'
              ? 'bg-emerald-900/40 text-emerald-400'
              : 'bg-red-900/40 text-red-400'
          }`}>{pos.direction}</span>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold font-mono ${pnlColor}`}>
            {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}€
          </p>
          <p className="text-[10px] text-slate-600">{pos.size} units</p>
        </div>
      </div>

      {/* Price levels */}
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono mb-3">
        <div className="text-center">
          <p className="text-slate-600 mb-0.5">SL</p>
          <p className="text-red-400">{pos.sl.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-slate-600 mb-0.5">ENTRY</p>
          <p className="text-slate-300">{pos.entryPrice.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-slate-600 mb-0.5">TP2</p>
          <p className="text-emerald-400">{pos.tp2.toFixed(2)}</p>
        </div>
      </div>

      {/* Progress to TP */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-slate-600">
          <span>Progreso al TP</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progress >= 0 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${Math.max(0, progress)}%` }}
          />
        </div>
      </div>

      <p className="text-[10px] text-slate-700 mt-2">{pos.openTime}</p>
    </div>
  )
}

export function MonitorPage() {
  const { engineStatus, setEngineStatus, ibkrConfig } = useAppStore()
  const { ibkrStatus, isEngineRunning, positions, dailyPnl, dailyTrades, enginePort } = engineStatus
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string>('—')
  const [signalLog, setSignalLog] = useState<{ time: string; msg: string; type: 'info' | 'signal' | 'trade' }[]>([])

  // Poll engine for live data every 5s when connected
  useEffect(() => {
    if (!isEngineRunning || ibkrStatus !== 'connected') {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    const poll = async () => {
      try {
        const [posRes, statusRes] = await Promise.all([
          fetch(`http://127.0.0.1:${enginePort}/positions`),
          fetch(`http://127.0.0.1:${enginePort}/status`),
        ])
        if (posRes.ok && statusRes.ok) {
          const positions = await posRes.json()
          const status = await statusRes.json()
          setEngineStatus({
            positions,
            dailyPnl: status.daily_pnl ?? 0,
            dailyTrades: status.daily_trades ?? 0,
          })
          setLastUpdate(new Date().toLocaleTimeString())
        }
      } catch { /* offline */ }
    }

    poll()
    pollRef.current = setInterval(poll, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [isEngineRunning, ibkrStatus, enginePort, setEngineStatus])

  // Subscribe to signal WebSocket when engine is running
  useEffect(() => {
    if (!isEngineRunning) return
    let ws: WebSocket | null = null
    try {
      ws = new WebSocket(`ws://127.0.0.1:${enginePort}/ws/signals`)
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          setSignalLog(prev => [
            { time: new Date().toLocaleTimeString(), msg: data.message, type: data.type ?? 'info' },
            ...prev.slice(0, 49),
          ])
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return () => { ws?.close() }
  }, [isEngineRunning, enginePort])

  const isOffline = !isEngineRunning || ibkrStatus !== 'connected'

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Monitor</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isOffline ? 'Conecta IBKR en Deploy para ver datos en tiempo real' : `Actualizado: ${lastUpdate}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              ibkrStatus === 'connected' ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-slate-700'
            }`} />
            <span className="text-xs text-slate-500">
              {ibkrStatus === 'connected'
                ? `IBKR ${ibkrConfig.isPaper ? 'Paper' : 'LIVE'} · ${ibkrConfig.accountId || 'Sin cuenta'}`
                : 'Desconectado'}
            </span>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="P&L Hoy"
            value={`${dailyPnl >= 0 ? '+' : ''}€${dailyPnl.toFixed(2)}`}
            sub="Realizado + No realizado"
            color={dailyPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
          <StatCard
            label="Posiciones Abiertas"
            value={positions.length.toString()}
            sub={isOffline ? '—' : 'activas ahora'}
            color={positions.length > 0 ? 'text-amber-400' : 'text-slate-400'}
          />
          <StatCard
            label="Trades Hoy"
            value={dailyTrades.toString()}
            sub="ejecutados"
            color="text-slate-300"
          />
          <StatCard
            label="P&L No Real."
            value={`${positions.reduce((s, p) => s + p.unrealizedPnl, 0) >= 0 ? '+' : ''}€${
              positions.reduce((s, p) => s + p.unrealizedPnl, 0).toFixed(2)
            }`}
            sub="en posiciones abiertas"
            color={positions.reduce((s, p) => s + p.unrealizedPnl, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
          />
        </div>

        {/* Positions + Signal log */}
        <div className="grid grid-cols-2 gap-5">

          {/* Open positions */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Posiciones Abiertas
            </h3>
            {positions.length === 0 ? (
              <div className="bg-[#070d1a] border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center gap-3">
                <span className="text-3xl text-slate-800">◎</span>
                <p className="text-xs text-slate-600">
                  {isOffline ? 'Conecta IBKR para ver posiciones' : 'Sin posiciones abiertas'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map(p => <PositionRow key={`${p.symbol}-${p.openTime}`} pos={p} />)}
              </div>
            )}
          </div>

          {/* Signal log */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Log de Señales
            </h3>
            <div className="bg-[#070d1a] border border-slate-800 rounded-xl p-3 h-80 overflow-y-auto font-mono">
              {signalLog.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-slate-700">
                    {isOffline ? 'Engine offline' : 'Esperando señales…'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {signalLog.map((entry, i) => (
                    <div key={i} className="flex gap-2 text-[10px]">
                      <span className="text-slate-700 w-16 flex-shrink-0">{entry.time}</span>
                      <span className={
                        entry.type === 'signal' ? 'text-amber-400' :
                        entry.type === 'trade'  ? 'text-emerald-400' :
                        'text-slate-500'
                      }>{entry.msg}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Offline banner */}
        {isOffline && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center gap-4">
            <span className="text-2xl text-slate-700">◈</span>
            <div>
              <p className="text-sm text-slate-400 font-medium">Bot no activo</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Ve a <span className="text-amber-400/70">Deploy</span> para iniciar el engine y conectar IBKR TWS.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
