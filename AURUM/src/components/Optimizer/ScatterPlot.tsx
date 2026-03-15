import { useRef, useEffect } from 'react'
import type { Observation } from '../../types'

interface Props {
  observations: Observation[]
  xKey: string
  yKey: string
}

export function ScatterPlot({ observations, xKey, yKey }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || observations.length === 0) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth, h = canvas.offsetHeight
    canvas.width = w * dpr; canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const pad = { top: 15, right: 15, bottom: 35, left: 45 }
    const chartW = w - pad.left - pad.right
    const chartH = h - pad.top  - pad.bottom
    ctx.clearRect(0, 0, w, h)

    const xs = observations.map(o => (o.params as Record<string, number>)[xKey] ?? 0)
    const ys = observations.map(o => (o.params as Record<string, number>)[yKey] ?? 0)
    const scores = observations.map(o => o.score)

    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const minS = Math.min(...scores), maxS = Math.max(...scores)

    const xS = (v: number) => pad.left + ((v - minX) / (maxX - minX || 1)) * chartW
    const yS = (v: number) => pad.top  + chartH - ((v - minY) / (maxY - minY || 1)) * chartH

    // Colormap: azul (bajo score) → rojo (alto score)
    function scoreToColor(s: number): string {
      const t = (s - minS) / (maxS - minS || 1)
      const r = Math.round(59  + t * (239 - 59))
      const g = Math.round(130 + t * (68  - 130))
      const b = Math.round(246 + t * (68  - 246))
      return `rgb(${r},${g},${b})`
    }

    // Ordenar por score para que los mejores queden encima
    const sorted = [...observations].sort((a, b) => a.score - b.score)
    const bestObs = observations.reduce((best, o) => o.score > best.score ? o : best, observations[0])

    for (const obs of sorted) {
      const x = xS((obs.params as Record<string, number>)[xKey] ?? 0)
      const y = yS((obs.params as Record<string, number>)[yKey] ?? 0)
      ctx.fillStyle = scoreToColor(obs.score)
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Estrella para el mejor
    const bx = xS((bestObs.params as Record<string, number>)[xKey] ?? 0)
    const by = yS((bestObs.params as Record<string, number>)[yKey] ?? 0)
    ctx.shadowBlur = 12
    ctx.shadowColor = '#f59e0b'
    ctx.fillStyle = '#f59e0b'
    drawStar(ctx, bx, by, 5, 8, 4)
    ctx.shadowBlur = 0

    // Ejes
    ctx.fillStyle = '#4b5563'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
    ctx.fillText(xKey, pad.left + chartW / 2, h - 5)
    ctx.save()
    ctx.translate(12, pad.top + chartH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(yKey, 0, 0)
    ctx.restore()
  }, [observations, xKey, yKey])

  return <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerR: number, innerR: number) {
  let rot = (Math.PI / 2) * 3
  const step = Math.PI / spikes
  ctx.beginPath()
  ctx.moveTo(cx, cy - outerR)
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR)
    rot += step
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR)
    rot += step
  }
  ctx.lineTo(cx, cy - outerR)
  ctx.closePath()
  ctx.fill()
}
