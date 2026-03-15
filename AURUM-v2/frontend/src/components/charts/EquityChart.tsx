import { useRef, useEffect } from 'react'

interface Point { date: string; equity: number; drawdown: number }

export function EquityChart({ data, capital }: { data: Point[]; capital: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || data.length < 2) return
    const ctx = canvas.getContext('2d')!
    const { width: W, height: H } = canvas
    ctx.clearRect(0, 0, W, H)

    const eq  = data.map(p => p.equity)
    const dd  = data.map(p => p.drawdown)
    const minE = Math.min(...eq, capital)
    const maxE = Math.max(...eq)
    const rangeE = maxE - minE || 1

    const x = (i: number) => (i / (data.length - 1)) * W
    const y = (v: number) => H * 0.7 - ((v - minE) / rangeE) * (H * 0.65)

    // Drawdown shaded area (bottom 30% of canvas)
    const ddMin = Math.min(...dd)
    const ddRange = ddMin < 0 ? Math.abs(ddMin) : 1
    const yd = (v: number) => H - (Math.abs(v) / ddRange) * (H * 0.25)

    ctx.fillStyle = 'rgba(239,68,68,0.08)'
    ctx.beginPath()
    ctx.moveTo(x(0), H)
    data.forEach((p, i) => ctx.lineTo(x(i), yd(p.drawdown)))
    ctx.lineTo(x(data.length - 1), H)
    ctx.closePath()
    ctx.fill()

    // Drawdown line
    ctx.strokeStyle = 'rgba(239,68,68,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    data.forEach((p, i) => i === 0 ? ctx.moveTo(x(i), yd(p.drawdown)) : ctx.lineTo(x(i), yd(p.drawdown)))
    ctx.stroke()

    // Capital baseline
    const yBase = y(capital)
    ctx.strokeStyle = 'rgba(148,163,184,0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, yBase); ctx.lineTo(W, yBase)
    ctx.stroke()
    ctx.setLineDash([])

    // Equity fill
    const grad = ctx.createLinearGradient(0, 0, 0, H * 0.7)
    grad.addColorStop(0, 'rgba(245,158,11,0.18)')
    grad.addColorStop(1, 'rgba(245,158,11,0.01)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(x(0), y(capital))
    data.forEach((p, i) => ctx.lineTo(x(i), y(p.equity)))
    ctx.lineTo(x(data.length - 1), y(capital))
    ctx.closePath()
    ctx.fill()

    // Equity line
    const isUp = data[data.length - 1].equity >= capital
    ctx.strokeStyle = isUp ? '#f59e0b' : '#f87171'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    data.forEach((p, i) => i === 0 ? ctx.moveTo(x(i), y(p.equity)) : ctx.lineTo(x(i), y(p.equity)))
    ctx.stroke()
  }, [data, capital])

  return <canvas ref={ref} width={900} height={200} className="w-full h-[200px]" />
}
