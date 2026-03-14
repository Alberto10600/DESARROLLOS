import { useRef, useEffect } from 'react'
import type { YearlyStats } from '../../types'

export function YearlyBars({ byYear }: { byYear: Record<number, YearlyStats> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const years = Object.values(byYear).sort((a, b) => a.year - b.year)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || years.length === 0) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth, h = canvas.offsetHeight
    canvas.width = w * dpr; canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const pad = { top: 30, right: 20, bottom: 40, left: 55 }
    const chartW = w - pad.left - pad.right
    const chartH = h - pad.top  - pad.bottom
    ctx.clearRect(0, 0, w, h)

    const returns = years.map(y => y.returnPct)
    const maxAbs = Math.max(...returns.map(Math.abs), 5)
    const barW = (chartW / years.length) * 0.6
    const gapW = chartW / years.length

    const baseY = pad.top + chartH / 2

    // ── Línea cero ────────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad.left, baseY)
    ctx.lineTo(pad.left + chartW, baseY)
    ctx.stroke()

    // ── Barras ────────────────────────────────────────────────────────────────
    years.forEach((y, i) => {
      const x   = pad.left + i * gapW + gapW / 2 - barW / 2
      const barH = (Math.abs(y.returnPct) / maxAbs) * (chartH / 2)
      const isPos = y.returnPct >= 0
      const barY  = isPos ? baseY - barH : baseY

      const color = isPos ? '#10b981' : '#ef4444'
      ctx.shadowBlur = 8
      ctx.shadowColor = color
      ctx.fillStyle   = color + 'cc'
      ctx.fillRect(x, barY, barW, barH)
      ctx.shadowBlur = 0

      // Valor encima/debajo
      ctx.fillStyle  = color
      ctx.font       = '10px monospace'
      ctx.textAlign  = 'center'
      const label = `${y.returnPct >= 0 ? '+' : ''}${y.returnPct.toFixed(1)}%`
      ctx.fillText(label, x + barW / 2, isPos ? barY - 4 : barY + barH + 12)

      // Año
      ctx.fillStyle = '#4b5563'
      ctx.fillText(String(y.year), x + barW / 2, h - 12)
    })

    // ── Eje Y ─────────────────────────────────────────────────────────────────
    ctx.textAlign = 'right'
    ctx.fillStyle = '#4b5563'
    for (const pct of [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs]) {
      const y = baseY - (pct / maxAbs) * (chartH / 2)
      ctx.fillText(`${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`, pad.left - 5, y + 4)
    }
  }, [years])

  return <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
}
