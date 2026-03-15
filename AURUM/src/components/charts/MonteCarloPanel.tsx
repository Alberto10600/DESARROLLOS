/**
 * Monte Carlo Panel
 * Muestra la distribución de posibles equity curves usando Monte Carlo.
 * Permite ver el riesgo real más allá de un único backtest determinista.
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import type { Trade } from '../../types'
import { runMonteCarlo } from '../../engine/backtestEngine'
import type { MonteCarloResult } from '../../engine/backtestEngine'

interface Props {
  trades: Trade[]
  initialCapital: number
}

export function MonteCarloPanel({ trades, initialCapital }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [result, setResult] = useState<MonteCarloResult | null>(null)
  const [running, setRunning] = useState(false)
  const [sims, setSims] = useState(500)

  const runSimulation = useCallback(() => {
    if (trades.length < 5) return
    setRunning(true)
    setTimeout(() => {
      try {
        const r = runMonteCarlo(trades, initialCapital, sims)
        setResult(r)
      } finally {
        setRunning(false)
      }
    }, 0)
  }, [trades, initialCapital, sims])

  // Draw canvas when result changes
  useEffect(() => {
    if (!result || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    canvas.width  = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const pad = { top: 20, right: 20, bottom: 30, left: 60 }
    const cw = w - pad.left - pad.right
    const ch = h - pad.top  - pad.bottom

    const { bandUpper, bandMedian, bandLower } = result
    const n = bandMedian.length
    if (n < 2) return

    const allVals = [...bandUpper, ...bandLower].filter(isFinite)
    const minV = Math.min(...allVals, initialCapital * 0.5)
    const maxV = Math.max(...allVals, initialCapital)
    const range = maxV - minV || 1

    const xS = (i: number) => pad.left + (i / (n - 1)) * cw
    const yS = (v: number) => pad.top + ch - ((v - minV) / range) * ch

    // ── Banda p25-p75 ─────────────────────────────────────────────────────
    ctx.beginPath()
    bandUpper.forEach((v, i) => i === 0 ? ctx.moveTo(xS(i), yS(v)) : ctx.lineTo(xS(i), yS(v)))
    bandLower.slice().reverse().forEach((v, i) => ctx.lineTo(xS(n - 1 - i), yS(v)))
    ctx.closePath()
    ctx.fillStyle = 'rgba(245,158,11,0.1)'
    ctx.fill()

    // ── Mediana ───────────────────────────────────────────────────────────
    ctx.shadowBlur = 6
    ctx.shadowColor = '#f59e0b'
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.beginPath()
    bandMedian.forEach((v, i) => i === 0 ? ctx.moveTo(xS(i), yS(v)) : ctx.lineTo(xS(i), yS(v)))
    ctx.stroke()
    ctx.shadowBlur = 0

    // ── Línea de capital inicial ──────────────────────────────────────────
    const zeroY = yS(initialCapital)
    ctx.strokeStyle = 'rgba(148,163,184,0.25)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(pad.left, zeroY)
    ctx.lineTo(w - pad.right, zeroY)
    ctx.stroke()
    ctx.setLineDash([])

    // ── Ejes Y ────────────────────────────────────────────────────────────
    ctx.fillStyle = '#4b5563'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    for (let t = 0; t <= 4; t++) {
      const v = minV + (range * t / 4)
      ctx.fillText(v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0), pad.left - 5, yS(v) + 4)
    }

    // ── Etiqueta mediana final ────────────────────────────────────────────
    const lastMedian = bandMedian[n - 1]
    ctx.fillStyle = '#f59e0b'
    ctx.textAlign = 'left'
    ctx.fillText(`~${lastMedian >= 1000 ? `${(lastMedian/1000).toFixed(1)}k` : lastMedian.toFixed(0)}`, xS(n-1) + 4, yS(lastMedian) + 4)

  }, [result, initialCapital])

  const fmt = (v: number) => v >= 1000 ? `€${(v/1000).toFixed(1)}k` : `€${v.toFixed(0)}`
  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">

      {/* ── Controles ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-xs text-slate-500">Simulaciones</span>
        <div className="flex gap-1">
          {[200, 500, 1000].map(n => (
            <button key={n} onClick={() => setSims(n)}
              className={`px-2.5 py-1 text-xs rounded font-mono transition-colors ${sims === n ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}>
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={runSimulation}
          disabled={running || trades.length < 5}
          className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded disabled:opacity-50 transition-colors"
        >
          {running ? '⟳ Calculando…' : '▶ RUN MONTE CARLO'}
        </button>
        {result && (
          <span className="text-[10px] text-slate-600 ml-auto">{result.simulations} simulaciones · {trades.length} trades</span>
        )}
      </div>

      {!result ? (
        <div className="flex-1 flex items-center justify-center text-slate-700">
          <div className="text-center">
            <div className="text-4xl mb-2">🎲</div>
            <p className="text-sm">Permuta aleatoriamente el orden de los trades</p>
            <p className="text-xs mt-1 text-slate-600">para medir la distribución real de posibles resultados</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Distribución de equity final ───────────────────────────── */}
          <div className="grid grid-cols-5 gap-2 shrink-0">
            {[
              { label: 'P5 (peor)', value: fmt(result.p5FinalEquity), sub: fmtPct(result.p5Return), color: 'text-red-400' },
              { label: 'P25', value: fmt(result.p25FinalEquity), sub: '', color: 'text-orange-400' },
              { label: 'P50 (mediana)', value: fmt(result.p50FinalEquity), sub: fmtPct(result.p50Return), color: 'text-amber-400' },
              { label: 'P75', value: fmt(result.p75FinalEquity), sub: '', color: 'text-emerald-400' },
              { label: 'P95 (mejor)', value: fmt(result.p95FinalEquity), sub: fmtPct(result.p95Return), color: 'text-emerald-300' },
            ].map(s => (
              <div key={s.label} className="bg-slate-900/60 border border-slate-800 rounded p-2.5">
                <p className="text-[10px] text-slate-500 mb-1">{s.label}</p>
                <p className={`text-sm font-bold font-mono ${s.color}`}>{s.value}</p>
                {s.sub && <p className="text-[10px] text-slate-600">{s.sub}</p>}
              </div>
            ))}
          </div>

          {/* ── Métricas de riesgo ─────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2 shrink-0">
            {[
              { label: 'Max DD peor caso (P95)', value: `-${result.p5MaxDrawdown.toFixed(1)}%`, color: 'text-red-400' },
              { label: 'Max DD mediana', value: `-${result.p50MaxDrawdown.toFixed(1)}%`, color: 'text-orange-400' },
              { label: 'Prob. ruina (−50%)', value: `${result.ruinProbability.toFixed(1)}%`, color: result.ruinProbability > 10 ? 'text-red-400' : 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-900/60 border border-slate-800 rounded p-2.5">
                <p className="text-[10px] text-slate-500 mb-1">{s.label}</p>
                <p className={`text-base font-bold font-mono ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* ── Canvas ────────────────────────────────────────────────── */}
          <div className="flex-1 min-h-0">
            <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
          </div>

          <p className="text-[10px] text-slate-600 shrink-0">
            La banda muestra el rango P25–P75 de equity. La línea dorada es la mediana (P50).
            Si P5 es negativo o ruina &gt; 10%, considera reducir el riesgo por operación.
          </p>
        </>
      )}
    </div>
  )
}
