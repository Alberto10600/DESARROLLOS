import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-400' : 'bg-slate-700'}`} />
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{children}</h3>
  )
}

export function DeployPage() {
  const {
    ibkrConfig, setIbkrConfig,
    engineStatus, setEngineStatus,
    backtestResult, strategyParams, candles, config,
  } = useAppStore()

  const [isConnecting, setIsConnecting] = useState(false)
  const [checkingEngine, setCheckingEngine] = useState(false)

  const { ibkrStatus, isEngineRunning, enginePort } = engineStatus

  // ── Preflight checks ──────────────────────────────────────────────────────
  const hasData       = candles.length >= 500
  const hasBacktest   = backtestResult !== null
  const strategyValid = hasBacktest && (backtestResult?.metrics.profitFactor ?? 0) > 1.0
  const ddOk          = hasBacktest && (backtestResult?.metrics.maxDrawdown ?? 100) < 25
  const tradesOk      = hasBacktest && (backtestResult?.metrics.totalTrades ?? 0) >= 30
  const engineOk      = isEngineRunning
  const ibkrOk        = ibkrStatus === 'connected'

  const preflightPassed = hasData && strategyValid && ddOk && tradesOk && engineOk && ibkrOk

  // ── Engine ping ───────────────────────────────────────────────────────────
  const pingEngine = async () => {
    setCheckingEngine(true)
    try {
      const res = await fetch(`http://127.0.0.1:${enginePort}/health`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        setEngineStatus({ isEngineRunning: true })
      } else {
        setEngineStatus({ isEngineRunning: false })
      }
    } catch {
      setEngineStatus({ isEngineRunning: false })
    } finally {
      setCheckingEngine(false)
    }
  }

  // ── IBKR connect ─────────────────────────────────────────────────────────
  const connectIbkr = async () => {
    if (!isEngineRunning) return
    setIsConnecting(true)
    setEngineStatus({ ibkrStatus: 'connecting' })
    try {
      const res = await fetch(`http://127.0.0.1:${enginePort}/ibkr/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ibkrConfig),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()
      if (data.status === 'connected') {
        setEngineStatus({ ibkrStatus: 'connected', ibkrError: undefined })
      } else {
        setEngineStatus({ ibkrStatus: 'error', ibkrError: data.error ?? 'Connection failed' })
      }
    } catch (err) {
      setEngineStatus({ ibkrStatus: 'error', ibkrError: 'Engine no disponible' })
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnectIbkr = async () => {
    try {
      await fetch(`http://127.0.0.1:${enginePort}/ibkr/disconnect`, { method: 'POST' })
    } catch { /* ignore */ }
    setEngineStatus({ ibkrStatus: 'disconnected' })
  }

  // ── Deploy strategy ───────────────────────────────────────────────────────
  const deployStrategy = async () => {
    if (!preflightPassed || !backtestResult) return
    try {
      await fetch(`http://127.0.0.1:${enginePort}/strategy/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          params: strategyParams,
          symbol: config.symbol,
          interval: config.interval,
          capital: config.capital,
          isPaper: ibkrConfig.isPaper,
        }),
      })
    } catch { /* offline */ }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-slate-100">Deploy Bot</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Conecta IBKR TWS, valida el preflight y despliega la estrategia en vivo
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">

          {/* Left: IBKR + Engine config */}
          <div className="space-y-5">

            {/* Python Engine */}
            <div className="bg-[#070d1a] border border-slate-800 rounded-xl p-5">
              <SectionTitle>1 · Python Engine</SectionTitle>
              <p className="text-xs text-slate-500 mb-4">
                Inicia <span className="font-mono text-amber-400/80">AURUM-Engine/main.py</span> antes de continuar.
              </p>
              <div className="flex items-center gap-3 mb-4">
                <div>
                  <label className="text-[10px] text-slate-600 uppercase block mb-1">Puerto</label>
                  <input
                    type="number"
                    value={enginePort}
                    onChange={e => setEngineStatus({ enginePort: Number(e.target.value) })}
                    className="w-24 bg-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded border border-slate-700 font-mono"
                  />
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                  <StatusDot ok={isEngineRunning} />
                  <span className={`text-xs ${isEngineRunning ? 'text-emerald-400' : 'text-slate-600'}`}>
                    {isEngineRunning ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
              <button
                onClick={pingEngine}
                disabled={checkingEngine}
                className="w-full py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
              >
                {checkingEngine ? 'Verificando…' : 'Ping Engine'}
              </button>
            </div>

            {/* IBKR Config */}
            <div className="bg-[#070d1a] border border-slate-800 rounded-xl p-5">
              <SectionTitle>2 · Interactive Brokers TWS</SectionTitle>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-[10px] text-slate-600 uppercase block mb-1">Host</label>
                  <input
                    type="text"
                    value={ibkrConfig.host}
                    onChange={e => setIbkrConfig({ host: e.target.value })}
                    className="w-full bg-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded border border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 uppercase block mb-1">Puerto TWS</label>
                  <input
                    type="number"
                    value={ibkrConfig.port}
                    onChange={e => setIbkrConfig({ port: Number(e.target.value) })}
                    className="w-full bg-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded border border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 uppercase block mb-1">Client ID</label>
                  <input
                    type="number"
                    value={ibkrConfig.clientId}
                    onChange={e => setIbkrConfig({ clientId: Number(e.target.value) })}
                    className="w-full bg-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded border border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 uppercase block mb-1">Account</label>
                  <input
                    type="text"
                    value={ibkrConfig.accountId}
                    placeholder="DU1234567"
                    onChange={e => setIbkrConfig({ accountId: e.target.value })}
                    className="w-full bg-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded border border-slate-700 font-mono placeholder:text-slate-700"
                  />
                </div>
              </div>

              {/* Paper / Live toggle */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setIbkrConfig({ port: 7497, isPaper: true })}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    ibkrConfig.isPaper
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Paper (7497)
                </button>
                <button
                  onClick={() => setIbkrConfig({ port: 7496, isPaper: false })}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    !ibkrConfig.isPaper
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  ⚠ Live (7496)
                </button>
              </div>

              {engineStatus.ibkrError && (
                <p className="text-xs text-red-400 mb-3 bg-red-950/30 border border-red-900/40 rounded px-3 py-2">
                  {engineStatus.ibkrError}
                </p>
              )}

              {ibkrStatus === 'connected' ? (
                <button
                  onClick={disconnectIbkr}
                  className="w-full py-2 text-xs font-medium bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900/40 rounded-lg transition-colors"
                >
                  Desconectar IBKR
                </button>
              ) : (
                <button
                  onClick={connectIbkr}
                  disabled={!isEngineRunning || isConnecting}
                  className="w-full py-2 text-xs font-medium bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-900/40 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isConnecting ? 'Conectando…' : 'Conectar a TWS'}
                </button>
              )}
            </div>
          </div>

          {/* Right: Preflight + Deploy */}
          <div className="space-y-5">

            {/* Preflight checklist */}
            <div className="bg-[#070d1a] border border-slate-800 rounded-xl p-5">
              <SectionTitle>3 · Preflight Checklist</SectionTitle>
              <div className="space-y-2.5">
                {[
                  { ok: hasData,       label: 'Datos cargados', sub: hasData ? `${candles.length} velas` : 'Mínimo 500 velas requeridas' },
                  { ok: strategyValid, label: 'Estrategia validada', sub: strategyValid ? `PF ${backtestResult?.metrics.profitFactor.toFixed(2)}` : 'Profit Factor < 1.0' },
                  { ok: ddOk,          label: 'Drawdown controlado', sub: ddOk ? `Max DD ${backtestResult?.metrics.maxDrawdown.toFixed(1)}%` : 'Max DD > 25%' },
                  { ok: tradesOk,      label: 'Muestra estadística', sub: tradesOk ? `${backtestResult?.metrics.totalTrades} trades` : 'Mínimo 30 trades' },
                  { ok: engineOk,      label: 'Engine online', sub: engineOk ? `Puerto ${enginePort}` : 'Inicia AURUM-Engine' },
                  { ok: ibkrOk,        label: 'IBKR conectado', sub: ibkrOk ? (ibkrConfig.isPaper ? 'Paper trading' : '⚠ Live trading') : 'Conectar TWS' },
                ].map(({ ok, label, sub }) => (
                  <div key={label} className="flex items-start gap-3">
                    <StatusDot ok={ok} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${ok ? 'text-slate-300' : 'text-slate-600'}`}>{label}</p>
                      <p className={`text-[10px] ${ok ? 'text-slate-500' : 'text-slate-700'}`}>{sub}</p>
                    </div>
                    <span className={`text-[10px] font-mono ${ok ? 'text-emerald-400' : 'text-slate-700'}`}>
                      {ok ? 'OK' : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Strategy summary */}
            {backtestResult && (
              <div className="bg-[#070d1a] border border-slate-800 rounded-xl p-5">
                <SectionTitle>4 · Estrategia a Desplegar</SectionTitle>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    { l: 'Activo',    v: config.symbol },
                    { l: 'Timeframe', v: config.interval },
                    { l: 'Riesgo',    v: `${strategyParams.riskPct}% / trade` },
                    { l: 'Capital',   v: `€${config.capital.toLocaleString()}` },
                    { l: 'TP1 RR',    v: `${strategyParams.tp1RR}R` },
                    { l: 'TP2 RR',    v: `${strategyParams.tp2RR}R` },
                    { l: 'Sharpe',    v: backtestResult.metrics.sharpeRatio.toFixed(2) },
                    { l: 'CAGR',      v: `${backtestResult.metrics.cagr.toFixed(1)}%` },
                  ].map(({ l, v }) => (
                    <div key={l} className="flex justify-between">
                      <span className="text-slate-600">{l}</span>
                      <span className="text-slate-300 font-mono">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deploy button */}
            <button
              onClick={deployStrategy}
              disabled={!preflightPassed}
              className={`w-full py-4 text-sm font-bold rounded-xl border transition-all ${
                preflightPassed
                  ? ibkrConfig.isPaper
                    ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-400'
                    : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400'
                  : 'bg-slate-900 border-slate-800 text-slate-700 cursor-not-allowed'
              }`}
            >
              {preflightPassed
                ? ibkrConfig.isPaper
                  ? '▶ Iniciar Bot (Paper)'
                  : '⚠ Iniciar Bot (LIVE REAL)'
                : 'Completa el preflight primero'
              }
            </button>

          </div>
        </div>
      </div>
    </div>
  )
}
