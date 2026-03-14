import { useRef, useEffect } from 'react'

interface Point { date: string; equity: number; drawdown: number }

interface Props {
  data: Point[]
  initialCapital: number
}

export function EquityChart({ data, initialCapital }: Props) {
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

    const pad = { top: 20, right: 20, bottom: 40, left: 70 }
    const chartW = w - pad.left - pad.right
    const chartH = h - pad.top  - pad.bottom

    ctx.clearRect(0, 0, w, h)

    const equities = data.map(d => d.equity)
    const minE = Math.min(...equities, initialCapital)
    const maxE = Math.max(...equities)
    const range = maxE - minE || 1

    const xScale = (i: number) => pad.left + (i / (data.length - 1)) * chartW
    const yScale = (v: number) => pad.top + chartH - ((v - minE) / range) * chartH

    // ── Fondo de años alternados ──────────────────────────────────────────────
    let prevYear = ''
    let bandStart = 0
    for (let i = 0; i < data.length; i++) {
      const year = data[i].date.slice(0, 4)
      if (year !== prevYear) {
        if (prevYear) {
          const yearIdx = parseInt(prevYear) - parseInt(data[0].date.slice(0, 4))
          ctx.fillStyle = yearIdx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'rgba(59,130,246,0.03)'
          ctx.fillRect(xScale(bandStart), pad.top, xScale(i) - xScale(bandStart), chartH)
        }
        prevYear = year
        bandStart = i
      }
    }

    // ── Línea baseline ────────────────────────────────────────────────────────
    const baseY = yScale(initialCapital)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad.left, baseY)
    ctx.lineTo(pad.left + chartW, baseY)
    ctx.stroke()
    ctx.setLineDash([])

    // ── Gradiente bajo la curva ───────────────────────────────────────────────
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH)
    grad.addColorStop(0, 'rgba(245,158,11,0.25)')
    grad.addColorStop(1, 'rgba(245,158,11,0)')

    ctx.beginPath()
    ctx.moveTo(xScale(0), yScale(data[0].equity))
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(xScale(i), yScale(data[i].equity))
    }
    ctx.lineTo(xScale(data.length - 1), pad.top + chartH)
    ctx.lineTo(xScale(0), pad.top + chartH)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // ── Línea principal ───────────────────────────────────────────────────────
    ctx.shadowBlur = 10
    ctx.shadowColor = '#f59e0b'
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(xScale(0), yScale(data[0].equity))
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(xScale(i), yScale(data[i].equity))
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    // ── Punto final ───────────────────────────────────────────────────────────
    const lastX = xScale(data.length - 1)
    const lastY = yScale(data[data.length - 1].equity)
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2)
    ctx.fill()

    // ── Eje Y ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#4b5563'
    ctx.font = '11px JetBrains Mono, monospace'
    ctx.textAlign = 'right'
    const ticks = 5
    for (let t = 0; t <= ticks; t++) {
      const v = minE + (range * t / ticks)
      const y = yScale(v)
      ctx.fillText(`€${(v / 1000).toFixed(1)}k`, pad.left - 8, y + 4)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + chartW, y)
      ctx.stroke()
    }

    // ── Eje X (años) ─────────────────────────────────────────────────────────
    ctx.textAlign = 'center'
    ctx.fillStyle = '#4b5563'
    const years = [...new Set(data.map(d => d.date.slice(0, 4)))]
    for (const year of years) {
      const idx = data.findIndex(d => d.date.slice(0, 4) === year)
      if (idx >= 0) {
        ctx.fillText(year, xScale(idx), h - 12)
      }
    }
  }, [data, initialCapital])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: 'block' }}
    />
  )
}
