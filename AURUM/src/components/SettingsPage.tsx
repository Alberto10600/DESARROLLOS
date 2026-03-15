import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { fetchCandles } from '../services/twelveData'

export function SettingsPage() {
  const { config, setConfig } = useAppStore()
  const [apiKey, setApiKey] = useState(config.apiKey)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced auto-persist config changes (except apiKey which is saved explicitly)
  useEffect(() => {
    if (!window.electronAPI) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.electronAPI!.setConfig(config).catch(() => {})
    }, 500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [config])

  const saveApiKey = async () => {
    setConfig({ apiKey })
    if (window.electronAPI) {
      await window.electronAPI.setApiKey(apiKey)
      // Also persist the full config so it survives restarts
      const { config: current } = useAppStore.getState()
      await window.electronAPI.setConfig({ ...current, apiKey })
    }
  }

  const testApiKey = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      await fetchCandles('XAU/USD', '1day', apiKey, '2024-01-01')
      setTestResult('ok')
      setConfig({ apiKey })
    } catch {
      setTestResult('error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-200 mb-6">Configuración</h2>

      {/* API Key */}
      <section className="bg-[#070d1a] border border-slate-800 rounded-lg p-5 mb-4">
        <h3 className="text-sm font-bold text-slate-300 mb-3">Twelve Data API</h3>
        <p className="text-xs text-slate-500 mb-3">
          Obtén tu API key gratuita en{' '}
          <button
            onClick={() => window.electronAPI?.openExternal('https://twelvedata.com')}
            className="text-amber-400 hover:underline"
          >
            twelvedata.com
          </button>
          . El plan gratuito incluye 800 llamadas/día.
        </p>
        <div className="flex gap-2">
          <input
            type="password" value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="tu-api-key-aqui"
            className="flex-1 bg-slate-800 text-slate-200 text-xs px-3 py-2 rounded border border-slate-700 font-mono"
          />
          <button onClick={testApiKey} disabled={testing || !apiKey}
            className="px-3 py-2 bg-slate-700 text-slate-300 text-xs rounded hover:bg-slate-600 disabled:opacity-50">
            {testing ? '⟳' : 'Test'}
          </button>
          <button onClick={saveApiKey} disabled={!apiKey}
            className="px-4 py-2 bg-amber-500 text-black text-xs font-bold rounded hover:bg-amber-400 disabled:opacity-50">
            Guardar
          </button>
        </div>
        {testResult === 'ok' && <p className="text-xs text-emerald-400 mt-2">✓ API key válida</p>}
        {testResult === 'error' && <p className="text-xs text-red-400 mt-2">✗ API key inválida o sin conexión</p>}
      </section>

      {/* General */}
      <section className="bg-[#070d1a] border border-slate-800 rounded-lg p-5 mb-4">
        <h3 className="text-sm font-bold text-slate-300 mb-3">General</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Capital inicial por defecto</span>
            <input type="number" value={config.capital} min={100} step={100}
              onChange={e => setConfig({ capital: Number(e.target.value) })}}
              className="w-28 bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700 text-right"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Riesgo por defecto (%)</span>
            <input type="number" value={config.defaultRisk} min={0.1} max={5} step={0.1}
              onChange={e => setConfig({ defaultRisk: Number(e.target.value) })}
              className="w-28 bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700 text-right"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Tema</span>
            <select value={config.theme} onChange={e => setConfig({ theme: e.target.value as 'dark' | 'darker' | 'midnight' })}
              className="bg-slate-800 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700">
              <option value="dark">Dark</option>
              <option value="darker">Darker</option>
              <option value="midnight">Midnight</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Compounding activado</span>
            <input type="checkbox" checked={config.compounding}
              onChange={e => setConfig({ compounding: e.target.checked })}
              className="accent-amber-400 w-4 h-4"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Mostrar sesiones en chart</span>
            <input type="checkbox" checked={config.showSessions}
              onChange={e => setConfig({ showSessions: e.target.checked })}
              className="accent-amber-400 w-4 h-4"
            />
          </div>
        </div>
      </section>

      {/* Info */}
      <section className="bg-[#070d1a] border border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-bold text-slate-300 mb-3">Acerca de AURUM</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          AURUM es un backtester de trading algorítmico basado en Smart Money Concepts (SMC).
          Incluye Grid Search y Bayesian Optimization (Gaussian Process + Expected Improvement)
          implementados desde cero en TypeScript puro, sin dependencias de ML externas.
        </p>
        <p className="text-xs text-red-400/70 mt-3">
          ⚠ Disclaimer: El rendimiento pasado no garantiza resultados futuros.
          Este software es solo para fines educativos y de investigación.
        </p>
      </section>
    </div>
  )
}
