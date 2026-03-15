import { useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'

interface CheckItem {
  id:    string
  label: string
  ok:    boolean | null
}

function Check({ ok, label }: { ok: boolean | null; label: string }) {
  const icon = ok === null ? '○' : ok ? '✓' : '✗'
  const color = ok === null ? 'text-slate-600' : ok ? 'text-emerald-400' : 'text-red-400'
  return (
    <div className={`flex items-center gap-2 text-xs ${ok === null ? 'text-slate-500' : ok ? 'text-emerald-400' : 'text-red-400'}`}>
      <span className={`font-mono text-[13px] ${color}`}>{icon}</span>
      {label}
    </div>
  )
}

export function Deploy() {
  const { result, multiResult, ibkr, setIbkr, engine, params, symbol, interval, capital } = useStore()
  const [connecting, setConnecting] = useState(false)
  const [deploying,  setDeploying]  = useState(false)
  const [connError,  setConnError]  = useState<string | null>(null)
  const [pingOk,     setPingOk]     = useState<boolean | null>(null)
  const [deployMsg,  setDeployMsg]  = useState<string | null>(null)

  const pingEngine = async () => {
    try {
      const r = await api.health() as { status: string; ibkr: boolean }
      setPingOk(r.status === 'ok')
    } catch {
      setPingOk(false)
    }
  }

  const connect = async () => {
    setConnecting(true); setConnError(null)
    try {
      await api.ibkrConnect(ibkr)
    } catch (e: unknown) {
      setConnError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    try { await api.ibkrDisconnect() } catch { /* ignore */ }
  }

  const checks: CheckItem[] = [
    { id: 'data',    label: 'Datos cargados (backtest ejecutado)',           ok: !!result },
    { id: 'pf',      label: `Profit Factor > 1  (actual: ${result?.metrics.profit_factor.toFixed(2) ?? '—'})`, ok: result ? result.metrics.profit_factor > 1 : null },
    { id: 'dd',      label: `Max Drawdown < 25%  (actual: ${result?.metrics.max_drawdown.toFixed(1) ?? '—'}%)`, ok: result ? result.metrics.max_drawdown < 25 : null },
    { id: 'trades',  label: `Muestra ≥ 30 trades  (actual: ${result?.metrics.total_trades ?? '—'})`,          ok: result ? result.metrics.total_trades >= 30 : null },
    { id: 'engine',  label: 'Python engine online',                          ok: pingOk },
    { id: 'ibkr',    label: 'IBKR TWS conectado',                           ok: engine.connected },
  ]

  const allOk = checks.every(c => c.ok === true)

  const deploy = async () => {
    setDeploying(true); setDeployMsg(null)
    try {
      await api.deploy({ symbol, interval, capital, params })
      setDeployMsg('Bot desplegado. Monitorizando en tiempo real →')
    } catch (e: unknown) {
      setDeployMsg(e instanceof Error ? e.message : 'Deploy failed')
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* Left */}
      <aside className="w-80 flex-shrink-0 border-r border-slate-800/60 p-5 flex flex-col gap-5 overflow-y-auto">
        {/* Engine ping */}
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-3">Python Engine</p>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${pingOk === true ? 'bg-emerald-500' : pingOk === false ? 'bg-red-500' : 'bg-slate-700'}`} />
            <span className="text-xs text-slate-400">{pingOk === true ? 'Online' : pingOk === false ? 'Sin respuesta' : 'Sin verificar'}</span>
            <button onClick={pingEngine} className="ml-auto text-[10px] text-amber-400 hover:text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded transition-colors">
              PING
            </button>
          </div>
          <p className="text-[10px] text-slate-700 mt-2">Asegúrate de que ejecutas: <code className="text-slate-500">python main.py</code></p>
        </div>

        {/* IBKR config */}
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-3">IBKR TWS</p>
          <div className="space-y-3">
            {/* Paper / Live toggle */}
            <div className="flex rounded overflow-hidden border border-slate-800 text-xs">
              <button onClick={() => setIbkr({ is_paper: true, port: 7497 })}
                className={`flex-1 py-1.5 font-medium transition-colors ${ibkr.is_paper ? 'bg-amber-500/10 text-amber-400' : 'text-slate-600 hover:text-slate-300'}`}>
                Paper (7497)
              </button>
              <button onClick={() => setIbkr({ is_paper: false, port: 7496 })}
                className={`flex-1 py-1.5 font-medium transition-colors border-l border-slate-800 ${!ibkr.is_paper ? 'bg-red-500/10 text-red-400' : 'text-slate-600 hover:text-slate-300'}`}>
                Live (7496)
              </button>
            </div>

            {!ibkr.is_paper && (
              <div className="px-3 py-2 bg-red-950/30 border border-red-900/30 text-red-400 text-[11px] rounded">
                ⚠ Modo LIVE — dinero real. Confirma que el bot está validado.
              </div>
            )}

            <div>
              <label className="text-[10px] text-slate-600 block mb-1">Host</label>
              <input value={ibkr.host} onChange={e => setIbkr({ host: e.target.value })}
                className="w-full bg-[#070d1a] border border-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-600 block mb-1">Puerto</label>
                <input type="number" value={ibkr.port} onChange={e => setIbkr({ port: Number(e.target.value) })}
                  className="w-full bg-[#070d1a] border border-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded font-mono" />
              </div>
              <div>
                <label className="text-[10px] text-slate-600 block mb-1">Client ID</label>
                <input type="number" value={ibkr.client_id} onChange={e => setIbkr({ client_id: Number(e.target.value) })}
                  className="w-full bg-[#070d1a] border border-slate-800 text-slate-200 text-xs px-2 py-1.5 rounded font-mono" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-600 block mb-1">Cuenta (opcional)</label>
              <input value={ibkr.account} onChange={e => setIbkr({ account: e.target.value })}
                placeholder="DU1234567"
                className="w-full bg-[#070d1a] border border-slate-800 text-slate-400 placeholder:text-slate-700 text-xs px-2 py-1.5 rounded font-mono" />
            </div>

            {connError && (
              <p className="text-[11px] text-red-400 bg-red-950/30 border border-red-900/30 px-3 py-2 rounded">{connError}</p>
            )}

            {engine.connected ? (
              <button onClick={disconnect}
                className="w-full py-1.5 bg-red-900/20 hover:bg-red-900/40 border border-red-900/30 text-red-400 text-xs font-medium rounded transition-colors">
                Desconectar IBKR
              </button>
            ) : (
              <button onClick={connect} disabled={connecting}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium rounded transition-colors">
                {connecting ? 'Conectando…' : 'Conectar a TWS'}
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Right */}
      <main className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Strategy summary */}
        <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-3">Configuración a Desplegar</p>
          <div className="grid grid-cols-4 gap-4 text-xs">
            <div><span className="text-slate-600 block mb-0.5">Activo</span><span className="font-mono text-slate-200">{symbol}</span></div>
            <div><span className="text-slate-600 block mb-0.5">Intervalo</span><span className="font-mono text-slate-200">{interval}</span></div>
            <div><span className="text-slate-600 block mb-0.5">Capital</span><span className="font-mono text-slate-200">€{capital.toLocaleString()}</span></div>
            <div><span className="text-slate-600 block mb-0.5">Vol Target</span><span className="font-mono text-amber-400">{params.target_vol_pct}%/año</span></div>
            <div><span className="text-slate-600 block mb-0.5">Donchian</span><span className="font-mono text-slate-200">{params.breakout_period}p</span></div>
            <div><span className="text-slate-600 block mb-0.5">ATR Period</span><span className="font-mono text-slate-200">{params.atr_period}p</span></div>
            <div><span className="text-slate-600 block mb-0.5">SL mult</span><span className="font-mono text-slate-200">{params.atr_sl_mult}×ATR</span></div>
            <div><span className="text-slate-600 block mb-0.5">TP RR</span><span className="font-mono text-slate-200">{params.tp_rr}R</span></div>
          </div>
          {result && (
            <div className="mt-3 pt-3 border-t border-slate-800 flex gap-6 text-xs">
              <span className="text-slate-600">Score <span className="font-mono text-amber-400">{result.score.toFixed(4)}</span></span>
              <span className="text-slate-600">PF <span className="font-mono text-emerald-400">{result.metrics.profit_factor.toFixed(2)}</span></span>
              <span className="text-slate-600">Sharpe <span className="font-mono text-slate-200">{result.metrics.sharpe.toFixed(2)}</span></span>
              <span className="text-slate-600">CAGR <span className="font-mono text-emerald-400">{result.metrics.cagr.toFixed(1)}%</span></span>
              <span className="text-slate-600">DD <span className="font-mono text-amber-400">-{result.metrics.max_drawdown.toFixed(1)}%</span></span>
              {multiResult && <span className="text-slate-600">Robustez <span className={`font-mono ${multiResult.robustness >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>{multiResult.robustness.toFixed(0)}%</span></span>}
            </div>
          )}
        </div>

        {/* Preflight */}
        <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-4">Preflight Checklist</p>
          <div className="space-y-3">
            {checks.map(c => <Check key={c.id} ok={c.ok} label={c.label} />)}
          </div>
          {!allOk && (
            <p className="mt-4 text-[11px] text-slate-600">
              {!result ? 'Ejecuta un backtest en Workspace primero.' :
               !engine.connected ? 'Conecta IBKR TWS y verifica el engine.' :
               'Algunos checks fallan. Revisa los parámetros.'}
            </p>
          )}
        </div>

        {/* Deploy */}
        {deployMsg && (
          <div className={`px-4 py-3 border rounded-lg text-xs ${deployMsg.includes('Bot') ? 'bg-emerald-950/30 border-emerald-900/30 text-emerald-400' : 'bg-red-950/30 border-red-900/30 text-red-400'}`}>
            {deployMsg}
          </div>
        )}

        <button onClick={deploy} disabled={!allOk || deploying}
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-bold text-sm rounded-lg transition-colors">
          {deploying ? 'Desplegando…' : allOk ? 'DEPLOY BOT' : 'Completa el preflight para continuar'}
        </button>

        <p className="text-[10px] text-slate-700 text-center">
          El bot generará señales automáticamente. Monitorea en tiempo real en la sección Monitor.
        </p>
      </main>
    </div>
  )
}
