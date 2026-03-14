import { useRef, useEffect } from 'react'

interface Props {
  convergenceHistory: number[]  // mejor score acumulado
  allScores: number[]           // score crudo de cada evaluación
  nInitial: number              // separador fase inicial / bayesiana
}

export function ConvergenceChart({ convergenceHistory, allScores, nInitial }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || convergenceHistory.length === 0) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth, h = canvas.offsetHeight
    canvas.width = w * dpr; canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const pad = { top: 15, right: 15, bottom: 30, left: 50 }
    const chartW = w - pad.left - pad.right
    const chartH = h - pad.top  - pad.bottom
    ctx.clearRect(0, 0, w, h)

    const n = convergenceHistory.length
    const allVals = [...convergenceHistory, ...allScores].filter(v => isFinite(v))
    const minV = Math.min(...allVals, 0)
    const maxV = Math.max(...allVals, 1)
    const range = maxV - minV || 1

    const xS = (i: number) => pad.left + (i / Math.max(n - 1, 1)) * chartW
    const yS = (v: number) => pad.top + chartH - ((v - minV) / range) * chartH

    // ── Separador fase aleatoria / bayesiana ──────────────────────────────────
    if (nInitial < n) {
      const sepX = xS(nInitial - 1)
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(245,158,11,0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sepX, pad.top)
      ctx.lineTo(sepX, pad.top + chartH)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,158,11,0.5)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('BO ▶', sepX + 20, pad.top + 10)
    }

    // ── Puntos crudos ────────────────────────────────────────────────────────
    for (let i = 0; i < Math.min(allScores.length, n); i++) {
      const v = allScores[i]
      if (!isFinite(v)) continue
      ctx.fillStyle = i < nInitial ? 'rgba(148,163,184,0.5)' : 'rgba(59,130,246,0.6)'
      ctx.beginPath()
      ctx.arc(xS(i), yS(v), 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // ── Curva de convergencia (mejor acumulado) ───────────────────────────────
    ctx.shadowBlur = 8
    ctx.shadowColor = '#f59e0b'
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const v = convergenceHistory[i]
      if (!isFinite(v)) continue
      i === 0 ? ctx.moveTo(xS(i), yS(v)) : ctx.lineTo(xS(i), yS(v))
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    // ── Ejes ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#4b5563'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    for (let t = 0; t <= 4; t++) {
      const v = minV + (range * t / 4)
      ctx.fillText(v.toFixed(2), pad.left - 5, yS(v) + 4)
    }
    ctx.textAlign = 'center'
    ctx.fillText('0', xS(0), h - 8)
    ctx.fillText(String(n), xS(n - 1), h - 8)

    // ── Leyenda ───────────────────────────────────────────────────────────────
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px monospace'; ctx.textAlign = 'left'
    ctx.fillStyle = '#3b82f6'
    ctx.fillRect(pad.left, pad.top + chartH + 2, 8, 8)
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('Evaluaciones', pad.left + 11, pad.top + chartH + 10)
    ctx.fillStyle = '#f59e0b'
    ctx.fillRect(pad.left + 95, pad.top + chartH + 2, 8, 8)
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('Mejor score', pad.left + 108, pad.top + chartH + 10)
  }, [convergenceHistory, allScores, nInitial])

  return <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
}
