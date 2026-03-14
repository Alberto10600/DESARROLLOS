import { useRef, useEffect } from 'react'

interface Point { date: string; equity: number; drawdown: number }

export function DrawdownChart({ data }: { data: Point[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length === 0) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1

    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    canvas.width  = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const pad = { top: 20, right: 20, bottom: 40, left: 60 }
    const chartW = w - pad.left - pad.right
    const chartH = h - pad.top  - pad.bottom

    ctx.clearRect(0, 0, w, h)

    const dds = data.map(d => d.drawdown)
    const minDD = Math.min(...dds, -1)

    const xScale = (i: number) => pad.left + (i / (data.length - 1)) * chartW
    const yScale = (v: number) => pad.top + (v / minDD) * chartH

    // ── Gradiente ─────────────────────────────────────────────────────────────
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH)
    grad.addColorStop(0, 'rgba(239,68,68,0.5)')
    grad.addColorStop(1, 'rgba(239,68,68,0)')

    ctx.beginPath()
    ctx.moveTo(xScale(0), pad.top)
    for (let i = 0; i < data.length; i++) {
      ctx.lineTo(xScale(i), yScale(data[i].drawdown))
    }
    ctx.lineTo(xScale(data.length - 1), pad.top)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // ── Línea ─────────────────────────────────────────────────────────────────
    ctx.shadowBlur = 6
    ctx.shadowColor = '#ef4444'
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(xScale(0), pad.top)
    for (let i = 0; i < data.length; i++) {
      ctx.lineTo(xScale(i), yScale(data[i].drawdown))
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    // ── Referencias horizontales ──────────────────────────────────────────────
    const refs = [-5, -10, -15, -20, -25].filter(r => r >= minDD * 0.9)
    ctx.setLineDash([3, 3])
    for (const r of refs) {
      if (r < minDD) continue
      const y = yScale(r)
      ctx.strokeStyle = 'rgba(239,68,68,0.2)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + chartW, y)
      ctx.stroke()
      ctx.fillStyle = '#6b7280'
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(`${r}%`, pad.left - 5, y + 4)
    }
    ctx.setLineDash([])

    // ── Eje X ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#4b5563'
    ctx.textAlign = 'center'
    ctx.font = '11px monospace'
    const years = [...new Set(data.map(d => d.date.slice(0, 4)))]
    for (const year of years) {
      const idx = data.findIndex(d => d.date.slice(0, 4) === year)
      if (idx >= 0) ctx.fillText(year, xScale(idx), h - 12)
    }
  }, [data])

  return <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
}
