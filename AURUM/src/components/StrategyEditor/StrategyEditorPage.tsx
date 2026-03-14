import { useState, useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { detectSignals } from '../../engine/smcStrategy'

// ─── SMC Strategy Source Code (embedded) ─────────────────────────────────────

const SMC_SOURCE_CODE = `/**
 * SMC Strategy Engine
 * Detecta señales basadas en Smart Money Concepts:
 *   1. Swing High/Low
 *   2. Liquidity Sweep
 *   3. CHoCH (Change of Character)
 *   4. Order Block (OB)
 *   5. Entry al retesteo del OB
 */

import type { Candle, StrategyParams, Trade } from '../types'

// ─── Signal Internal Types ────────────────────────────────────────────────────

interface SwingPoint {
  index: number
  price: number
  type: 'high' | 'low'
}

interface Signal {
  index: number            // vela de entrada
  direction: 'LONG' | 'SHORT'
  entry: number
  sl: number
  obHigh: number
  obLow: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEMA(candles: Candle[], period: number, endIndex: number): number {
  if (endIndex < period) return candles[endIndex].close
  const k = 2 / (period + 1)
  let ema = candles[endIndex - period + 1].close
  for (let i = endIndex - period + 2; i <= endIndex; i++) {
    ema = candles[i].close * k + ema * (1 - k)
  }
  return ema
}

function getATR(candles: Candle[], period: number, index: number): number {
  if (index < 1) return 0
  let sum = 0
  const start = Math.max(1, index - period + 1)
  for (let i = start; i <= index; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close)
    )
    sum += tr
  }
  return sum / (index - start + 1)
}

function isLondonSession(date: Date): boolean {
  const h = date.getUTCHours()
  return h >= 8 && h < 11
}
function isNYSession(date: Date): boolean {
  const h = date.getUTCHours()
  return h >= 13 && h < 16
}
function isAsiaSession(date: Date): boolean {
  const h = date.getUTCHours()
  return h < 3
}

// ─── Signal Detection ─────────────────────────────────────────────────────────

export function detectSignals(candles: Candle[], params: StrategyParams): Signal[] {
  const {
    swingLookback,
    obLookback,
    slBuffer,
    tp1RR,
    tp2RR,
    trendFilter = 'none',
    atrFilter = false,
    atrPeriod = 14,
    atrMinThreshold = 0,
    useLondonSession,
    useNYSession,
    useAsiaSession,
    minRiskReward = 1,
  } = params

  const signals: Signal[] = []
  const minPeriod = Math.max(swingLookback, obLookback) + 5

  for (let i = minPeriod; i < candles.length - 2; i++) {
    // ── Filtro de sesión ──────────────────────────────────────────────────────
    if (useLondonSession !== undefined || useNYSession !== undefined || useAsiaSession !== undefined) {
      const d = new Date(candles[i].timestamp)
      const london = useLondonSession && isLondonSession(d)
      const ny     = useNYSession && isNYSession(d)
      const asia   = useAsiaSession && isAsiaSession(d)
      if (!london && !ny && !asia) continue
    }

    // ── Filtro de tendencia ───────────────────────────────────────────────────
    if (trendFilter !== 'none') {
      const period = trendFilter === 'ema50' ? 50 : 200
      const ema = getEMA(candles, period, i)
      const price = candles[i].close
      if (Math.abs(price - ema) / ema < (params.trendStrength ?? 0)) continue
    }

    // ── Filtro ATR ────────────────────────────────────────────────────────────
    if (atrFilter) {
      const atr = getATR(candles, atrPeriod, i)
      if (atr < atrMinThreshold) continue
    }

    // ── 1. Swing High/Low (ventana: swingLookback velas antes de i) ───────────
    let swingHigh = -Infinity
    let swingLow  = Infinity
    let swingHighIdx = i
    let swingLowIdx  = i

    for (let j = i - swingLookback; j < i; j++) {
      if (candles[j].high > swingHigh) { swingHigh = candles[j].high; swingHighIdx = j }
      if (candles[j].low  < swingLow)  { swingLow  = candles[j].low;  swingLowIdx  = j }
    }

    const c = candles[i]

    // ── 2. Liquidity Sweep + CHoCH ────────────────────────────────────────────
    // SHORT SETUP: barrido alcista (wick sube sobre swingHigh y cierra debajo)
    if (
      c.high > swingHigh &&
      c.close < swingHigh &&
      i > swingHighIdx
    ) {
      // Buscar Order Block: última vela alcista antes del impulso bajista
      let obIndex = -1
      for (let k = i - 1; k >= Math.max(0, i - obLookback); k--) {
        if (candles[k].close > candles[k].open) {
          obIndex = k
          break
        }
      }
      if (obIndex < 0) continue

      const ob = candles[obIndex]
      const sl  = ob.high + slBuffer
      const risk = sl - ob.low
      if (risk <= 0) continue

      const tp1 = ob.low - risk * (tp1RR ?? 1.5)
      const tp2 = ob.low - risk * tp2RR
      const rr  = (ob.low - tp2) / risk
      if (rr < minRiskReward) continue

      if (trendFilter !== 'none') {
        const period = trendFilter === 'ema50' ? 50 : 200
        const ema = getEMA(candles, period, i)
        if (ob.low > ema) continue
      }

      signals.push({
        index: i + 1,
        direction: 'SHORT',
        entry: ob.low,
        sl,
        obHigh: ob.high,
        obLow: ob.low,
      })
    }

    // LONG SETUP: barrido bajista (wick baja bajo swingLow y cierra arriba)
    if (
      c.low  < swingLow &&
      c.close > swingLow &&
      i > swingLowIdx
    ) {
      // Buscar Order Block: última vela bajista antes del impulso alcista
      let obIndex = -1
      for (let k = i - 1; k >= Math.max(0, i - obLookback); k--) {
        if (candles[k].close < candles[k].open) {
          obIndex = k
          break
        }
      }
      if (obIndex < 0) continue

      const ob = candles[obIndex]
      const sl   = ob.low - slBuffer
      const risk = ob.high - sl
      if (risk <= 0) continue

      const tp1 = ob.high + risk * (tp1RR ?? 1.5)
      const tp2 = ob.high + risk * tp2RR
      const rr  = (tp2 - ob.high) / risk
      if (rr < minRiskReward) continue

      if (trendFilter !== 'none') {
        const period = trendFilter === 'ema50' ? 50 : 200
        const ema = getEMA(candles, period, i)
        if (ob.high < ema) continue
      }

      signals.push({
        index: i + 1,
        direction: 'LONG',
        entry: ob.high,
        sl,
        obHigh: ob.high,
        obLow: ob.low,
      })
    }
  }

  return signals
}`

// ─── Parameter Definitions ────────────────────────────────────────────────────

interface ParamDef {
  key: keyof {
    swingLookback: number
    obLookback: number
    tp1RR: number
    tp2RR: number
    riskPct: number
    slBuffer: number
  }
  label: string
  description: string
  min: number
  max: number
  step: number
  impact: 'alto' | 'medio' | 'bajo'
  unit: string
  detail: string
}

const PARAM_DEFS: ParamDef[] = [
  {
    key: 'swingLookback',
    label: 'Swing Lookback',
    description: 'Ventana de velas para detectar Swing High/Low',
    min: 5,
    max: 50,
    step: 1,
    impact: 'alto',
    unit: 'velas',
    detail:
      'Define cuántas velas atrás se analiza para encontrar el máximo y mínimo de swing. Un valor mayor captura swings más significativos pero genera menos señales.',
  },
  {
    key: 'obLookback',
    label: 'OB Lookback',
    description: 'Velas hacia atrás para buscar el Order Block',
    min: 3,
    max: 30,
    step: 1,
    impact: 'alto',
    unit: 'velas',
    detail:
      'Cuántas velas previas se revisan para identificar el Order Block (última vela opuesta al movimiento). Valores bajos dan OBs más recientes y relevantes.',
  },
  {
    key: 'tp1RR',
    label: 'TP1 Risk/Reward',
    description: 'Ratio riesgo/beneficio para el primer take profit (50%)',
    min: 0.5,
    max: 5,
    step: 0.1,
    impact: 'medio',
    unit: 'R',
    detail:
      'Al alcanzar TP1 se cierra el 50% de la posición y el SL se mueve a break-even. Un TP1 bajo incrementa la frecuencia de ganancias parciales.',
  },
  {
    key: 'tp2RR',
    label: 'TP2 Risk/Reward',
    description: 'Ratio riesgo/beneficio para el segundo take profit (50% restante)',
    min: 1,
    max: 10,
    step: 0.5,
    impact: 'alto',
    unit: 'R',
    detail:
      'Nivel donde se cierra la posición restante. Define el potencial máximo de ganancia por trade. Debe ser mayor que TP1.',
  },
  {
    key: 'riskPct',
    label: 'Riesgo por Trade',
    description: 'Porcentaje del equity arriesgado por operación',
    min: 0.1,
    max: 5,
    step: 0.1,
    impact: 'alto',
    unit: '%',
    detail:
      'El tamaño de la posición se calcula para que si el SL es alcanzado, la pérdida sea exactamente este % del equity actual. Con compounding activado, el tamaño crece con el equity.',
  },
  {
    key: 'slBuffer',
    label: 'SL Buffer',
    description: 'Puntos extra por encima/debajo del extremo del OB',
    min: 0,
    max: 20,
    step: 0.5,
    impact: 'bajo',
    unit: 'pts',
    detail:
      'Margen adicional en el Stop Loss para evitar que el precio toque el extremo exacto del OB y luego revierta. Protege contra wicks extremos.',
  },
]

// ─── SMC Logic Steps ──────────────────────────────────────────────────────────

const SMC_STEPS = [
  {
    num: 1,
    title: 'Swing Detection',
    color: 'text-blue-400',
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/5',
    description:
      'Se identifica el Swing High y Swing Low más recientes dentro de la ventana swingLookback. Estos representan la liquidez acumulada por encima/debajo del mercado.',
    ascii: `
  Precio
    │
  H ┤   ╭──╮   ← Swing High (liquidez aquí)
    │  ╱    ╲
    │ ╱      ╲
  L ┤╱        ╲──  ← Swing Low (liquidez aquí)
    │
    └──────────────→ Tiempo
       ← swingLookback →`,
  },
  {
    num: 2,
    title: 'Liquidity Sweep',
    color: 'text-yellow-400',
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/5',
    description:
      'El precio supera el Swing High/Low con un wick (mecha) pero CIERRA de vuelta al rango anterior. Esto indica que los Smart Money han barrido la liquidez de los retail traders.',
    ascii: `
  Precio
    │        ╷ ← wick supera SwingHigh
  H ┤╌╌╌╌╌╌╌┼╌ SwingHigh (nivel barrido)
    │       ╱│╲
    │      ╱ │ ╲← cierra debajo → SWEEP!
    │     ╱  ╵
    │────╱
    └──────────────→ Tiempo`,
  },
  {
    num: 3,
    title: 'CHoCH (Change of Character)',
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/5',
    description:
      'Tras el sweep, el cierre por debajo del Swing High (o sobre el Swing Low) confirma un cambio de carácter estructural. El mercado muestra intención de revertir dirección.',
    ascii: `
  Precio
    │
  H ┤╌╌╌╌╌╌╌╌╌╌╌ SwingHigh
    │       ╭─╮
    │      ╱  ╲
    │     ╱    ╲ ← precio baja y confirma
    │────╱      ╲   CHoCH bajista
    └──────────────→ Tiempo
            ↑
       Cambio de estructura`,
  },
  {
    num: 4,
    title: 'Order Block (OB)',
    color: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    description:
      'Se busca la última vela con dirección opuesta al impulso (alcista para SHORT, bajista para LONG) dentro de obLookback velas previas. Esta es la zona de órdenes institucionales.',
    ascii: `
  Precio
    │
    │     ╔═══╗ ← OB SHORT: última vela alcista
    │     ║   ║   antes del impulso bajista
    │     ╚═══╝
    │         │ ← Impulso bajista (CHoCH)
    │         ╰──╮
    │             ╲
    └──────────────→ Tiempo
       OB = zona de entrada`,
  },
  {
    num: 5,
    title: 'Entry + SL/TP',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    description:
      'La entrada se define en el extremo del OB. El SL se coloca al otro extremo + slBuffer. TP1 y TP2 se calculan según el ratio R:R configurado.',
    ascii: `
  Precio
    │  SL ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  (ob.high + buffer)
    │       ╔═══╗ ← Order Block
    │  ENTRY╚═══╝─ ─ ─ ─ ─ ─ ─ ─  (ob.low)
    │
    │  TP1 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  (entry - risk × tp1RR)
    │  TP2 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  (entry - risk × tp2RR)
    │
    └──────────────→ Tiempo
       risk = SL - ENTRY`,
  },
]

// ─── Syntax Highlighted Code Viewer ──────────────────────────────────────────

const KEYWORDS = [
  'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'continue',
  'break', 'export', 'import', 'interface', 'type', 'from', 'of', 'in', 'new',
  'true', 'false', 'null', 'undefined', 'Math', 'typeof', 'while',
]

function highlightLine(line: string): React.ReactNode[] {
  // Simple tokenizer: comments, strings, keywords, numbers
  const parts: React.ReactNode[] = []
  let remaining = line
  let key = 0

  while (remaining.length > 0) {
    // Comment
    if (remaining.startsWith('//')) {
      parts.push(<span key={key++} className="text-slate-500 italic">{remaining}</span>)
      remaining = ''
      continue
    }

    // String (single or double quote)
    const strMatch = remaining.match(/^(['"`])([^'"` ]*)\1/)
    if (strMatch) {
      parts.push(<span key={key++} className="text-emerald-400">{strMatch[0]}</span>)
      remaining = remaining.slice(strMatch[0].length)
      continue
    }

    // Numbers
    const numMatch = remaining.match(/^(\d+\.?\d*)/)
    if (numMatch) {
      parts.push(<span key={key++} className="text-blue-300">{numMatch[0]}</span>)
      remaining = remaining.slice(numMatch[0].length)
      continue
    }

    // Keywords
    let matched = false
    for (const kw of KEYWORDS) {
      if (remaining.startsWith(kw) && (remaining.length === kw.length || /\W/.test(remaining[kw.length]))) {
        parts.push(<span key={key++} className="text-amber-400 font-semibold">{kw}</span>)
        remaining = remaining.slice(kw.length)
        matched = true
        break
      }
    }
    if (matched) continue

    // Type annotations (after : or <)
    const typeMatch = remaining.match(/^([A-Z][a-zA-Z]+)/)
    if (typeMatch) {
      parts.push(<span key={key++} className="text-sky-300">{typeMatch[0]}</span>)
      remaining = remaining.slice(typeMatch[0].length)
      continue
    }

    // Default: consume one character
    parts.push(<span key={key++} className="text-slate-200">{remaining[0]}</span>)
    remaining = remaining.slice(1)
  }

  return parts
}

// ─── Main Component ───────────────────────────────────────────────────────────

type TabId = 'code' | 'params' | 'logic' | 'signals'

export function StrategyEditorPage() {
  const { candles, strategyParams, setStrategyParams } = useAppStore()
  const [activeTab, setActiveTab] = useState<TabId>('code')
  const [showApplyNote, setShowApplyNote] = useState(false)

  const localParams = strategyParams

  const signals = useMemo(() => {
    if (candles.length === 0) return []
    try {
      return detectSignals(candles, localParams).slice(-20).reverse()
    } catch {
      return []
    }
  }, [candles, localParams])

  const lines = SMC_SOURCE_CODE.split('\n')

  const TABS: { id: TabId; label: string }[] = [
    { id: 'code',    label: 'Código Estrategia' },
    { id: 'params',  label: 'Parámetros' },
    { id: 'logic',   label: 'Lógica SMC' },
    { id: 'signals', label: `Señales Activas${signals.length > 0 ? ` (${signals.length})` : ''}` },
  ]

  return (
    <div className="flex flex-col h-full bg-[#040810] text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/60 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-amber-400 text-lg">⚙</span>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">Editor de Estrategia SMC</h1>
            <p className="text-[11px] text-slate-500">smcStrategy.ts · Smart Money Concepts Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600 font-mono">v1.0.0</span>
          <button
            onClick={() => setShowApplyNote(v => !v)}
            className="px-3 py-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded transition-colors"
          >
            Aplicar cambios
          </button>
        </div>
      </div>

      {showApplyNote && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-slate-400 flex items-center gap-2 flex-shrink-0">
          <span className="text-amber-400">◈</span>
          Próximamente — compilación en runtime. Por ahora ajusta los parámetros en la pestaña Parámetros.
          <button onClick={() => setShowApplyNote(false)} className="ml-auto text-slate-600 hover:text-slate-400">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-800/60 px-6 flex-shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* ── Code Tab ── */}
        {activeTab === 'code' && (
          <div className="flex-1 overflow-hidden flex">
            {/* Code viewer (left ~60%) */}
            <div className="flex-1 overflow-auto bg-[#0a0f1e] font-mono text-[12px] leading-5">
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] group">
                      <td className="select-none text-right pr-4 pl-4 text-slate-600 border-r border-slate-800/60 w-12 group-hover:text-slate-500 sticky left-0 bg-[#0a0f1e]">
                        {idx + 1}
                      </td>
                      <td className="pl-4 pr-6 py-px whitespace-pre">
                        {highlightLine(line)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Info panel (right ~40%) */}
            <div className="w-[340px] flex-shrink-0 border-l border-slate-800/50 overflow-auto p-4 bg-[#040810]">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Descripción del archivo</h3>
              <div className="space-y-3">
                {[
                  { label: 'Archivo', value: 'smcStrategy.ts' },
                  { label: 'Líneas', value: `${lines.length}` },
                  { label: 'Función principal', value: 'detectSignals()' },
                  { label: 'Paradigma', value: 'Smart Money Concepts' },
                  { label: 'Entradas', value: 'Candle[], StrategyParams' },
                  { label: 'Salida', value: 'Signal[]' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-800/40">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="text-xs text-slate-300 font-mono">{value}</span>
                  </div>
                ))}
              </div>

              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-6 mb-3">Funciones exportadas</h3>
              <div className="space-y-2">
                {[
                  { name: 'detectSignals', desc: 'Detecta señales SMC en un array de velas', returns: 'Signal[]' },
                ].map(fn => (
                  <div key={fn.name} className="bg-slate-800/30 rounded p-3 border border-slate-700/30">
                    <p className="text-xs text-amber-400 font-mono font-semibold">{fn.name}()</p>
                    <p className="text-[11px] text-slate-500 mt-1">{fn.desc}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">→ {fn.returns}</p>
                  </div>
                ))}
              </div>

              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-6 mb-3">Funciones internas</h3>
              <div className="space-y-1.5">
                {[
                  { name: 'getEMA()', color: 'text-sky-400' },
                  { name: 'getATR()', color: 'text-sky-400' },
                  { name: 'isLondonSession()', color: 'text-purple-400' },
                  { name: 'isNYSession()', color: 'text-purple-400' },
                  { name: 'isAsiaSession()', color: 'text-purple-400' },
                ].map(fn => (
                  <div key={fn.name} className="flex items-center gap-2 py-1 px-2 rounded bg-slate-800/20">
                    <span className={`text-[11px] font-mono ${fn.color}`}>{fn.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Params Tab ── */}
        {activeTab === 'params' && (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto">
              <p className="text-sm text-slate-400 mb-6">
                Ajusta los parámetros de la estrategia SMC. Los cambios se aplican en tiempo real al ejecutar un backtest.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {PARAM_DEFS.map(p => {
                  const currentVal = (localParams as Record<string, number>)[p.key] ?? p.min
                  return (
                    <div key={p.key} className="bg-[#070d1a] border border-slate-800/60 rounded-xl p-5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{p.label}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{p.description}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            p.impact === 'alto'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : p.impact === 'medio'
                              ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                              : 'bg-green-500/10 text-green-400 border border-green-500/20'
                          }`}>
                            {p.impact} impacto
                          </span>
                        </div>
                      </div>

                      {/* Slider */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] text-slate-600">{p.min} {p.unit}</span>
                          <span className="text-base font-bold font-mono text-amber-400">
                            {Number(currentVal).toFixed(p.step < 1 ? 1 : 0)} {p.unit}
                          </span>
                          <span className="text-[11px] text-slate-600">{p.max} {p.unit}</span>
                        </div>
                        <input
                          type="range"
                          min={p.min}
                          max={p.max}
                          step={p.step}
                          value={currentVal}
                          onChange={e =>
                            setStrategyParams({ [p.key]: Number(e.target.value) })
                          }
                          className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-amber-500 cursor-pointer"
                        />
                      </div>

                      {/* Detail */}
                      <p className="text-[11px] text-slate-600 mt-3 leading-relaxed">{p.detail}</p>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                <p className="text-xs text-amber-400 font-semibold mb-1">Parámetros actuales</p>
                <pre className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap">
                  {JSON.stringify(
                    {
                      swingLookback: localParams.swingLookback,
                      obLookback: localParams.obLookback,
                      tp1RR: localParams.tp1RR,
                      tp2RR: localParams.tp2RR,
                      riskPct: localParams.riskPct,
                      slBuffer: localParams.slBuffer,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* ── Logic Tab ── */}
        {activeTab === 'logic' && (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-3xl mx-auto">
              <p className="text-sm text-slate-400 mb-6">
                Explicación visual paso a paso del algoritmo de detección de señales SMC implementado en smcStrategy.ts.
              </p>
              <div className="space-y-5">
                {SMC_STEPS.map(step => (
                  <div key={step.num} className={`border ${step.border} ${step.bg} rounded-xl overflow-hidden`}>
                    <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-800/40">
                      <span className={`text-xl font-bold font-mono ${step.color}`}>{step.num}</span>
                      <h3 className={`text-sm font-semibold ${step.color}`}>{step.title}</h3>
                    </div>
                    <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
                      <div>
                        <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
                      </div>
                      <div className="bg-[#0a0f1e] rounded-lg p-3 border border-slate-800/60">
                        <pre className={`text-[11px] font-mono ${step.color} leading-5 whitespace-pre`}>
                          {step.ascii}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Flow summary */}
                <div className="bg-[#070d1a] border border-slate-800/60 rounded-xl p-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Flujo completo de detección</h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {[
                      { label: 'Swing H/L', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
                      { label: '→', color: 'text-slate-600' },
                      { label: 'Liq. Sweep', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
                      { label: '→', color: 'text-slate-600' },
                      { label: 'CHoCH', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
                      { label: '→', color: 'text-slate-600' },
                      { label: 'Order Block', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
                      { label: '→', color: 'text-slate-600' },
                      { label: 'Entry/SL/TP', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
                    ].map((item, i) =>
                      item.label === '→' ? (
                        <span key={i} className={item.color}>{item.label}</span>
                      ) : (
                        <span key={i} className={`px-3 py-1 rounded-full border font-medium ${item.color}`}>
                          {item.label}
                        </span>
                      )
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-800/40">
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Cada vela <span className="text-slate-300 font-mono">i</span> es evaluada contra los últimos{' '}
                      <span className="text-amber-400 font-mono">swingLookback</span> velas para encontrar swings.
                      Si se detecta un sweep + CHoCH, se busca un Order Block en las últimas{' '}
                      <span className="text-amber-400 font-mono">obLookback</span> velas. La señal se genera
                      con entrada en el extremo del OB, SL al extremo contrario + buffer, y TPs según R:R configurado.
                      Opcionalmente se aplican filtros de sesión, tendencia (EMA) y volatilidad (ATR).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Signals Tab ── */}
        {activeTab === 'signals' && (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Señales detectadas (últimas 20)</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {candles.length === 0
                      ? 'Sin datos — carga velas en Backtesting primero'
                      : `Analizando ${candles.length} velas con parámetros actuales`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${candles.length > 0 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className="text-xs text-slate-500">{candles.length} velas</span>
                  </div>
                  <span className="text-xs text-amber-400 font-mono">{signals.length} señales</span>
                </div>
              </div>

              {candles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                  <span className="text-4xl mb-3">◎</span>
                  <p className="text-sm">Sin datos de velas</p>
                  <p className="text-xs mt-1">Ve a Backtesting y carga datos de mercado</p>
                </div>
              ) : signals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                  <span className="text-4xl mb-3">◈</span>
                  <p className="text-sm">Sin señales detectadas</p>
                  <p className="text-xs mt-1">Prueba ajustando los parámetros en la pestaña Parámetros</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800/60">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800/60 bg-[#070d1a]">
                        {['#', 'Iteración', 'Dirección', 'Entry', 'Stop Loss', 'TP1 (1.5R)', 'TP2', 'OB High', 'OB Low'].map(col => (
                          <th key={col} className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {signals.map((sig, idx) => {
                        const risk = sig.direction === 'LONG'
                          ? sig.entry - sig.sl
                          : sig.sl - sig.entry
                        const tp1 = sig.direction === 'LONG'
                          ? sig.entry + risk * (localParams.tp1RR ?? 1.5)
                          : sig.entry - risk * (localParams.tp1RR ?? 1.5)
                        const tp2 = sig.direction === 'LONG'
                          ? sig.entry + risk * localParams.tp2RR
                          : sig.entry - risk * localParams.tp2RR
                        const isLong = sig.direction === 'LONG'
                        return (
                          <tr
                            key={idx}
                            className="border-b border-slate-800/30 hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="px-3 py-2.5 text-slate-600 font-mono">{signals.length - idx}</td>
                            <td className="px-3 py-2.5 text-slate-400 font-mono">{sig.index}</td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isLong
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                                  : 'bg-red-500/15 text-red-400 border border-red-500/25'
                              }`}>
                                {sig.direction}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-200 font-mono">{sig.entry.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-red-400 font-mono">{sig.sl.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-yellow-400 font-mono">{tp1.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-emerald-400 font-mono">{tp2.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-slate-400 font-mono">{sig.obHigh.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-slate-400 font-mono">{sig.obLow.toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Summary stats */}
              {signals.length > 0 && (
                <div className="mt-4 grid grid-cols-4 gap-3">
                  {[
                    {
                      label: 'Total señales',
                      value: `${signals.length}`,
                      color: 'text-slate-200',
                    },
                    {
                      label: 'LONG',
                      value: `${signals.filter(s => s.direction === 'LONG').length}`,
                      color: 'text-emerald-400',
                    },
                    {
                      label: 'SHORT',
                      value: `${signals.filter(s => s.direction === 'SHORT').length}`,
                      color: 'text-red-400',
                    },
                    {
                      label: 'Señales / vela',
                      value: `${(signals.length / candles.length * 100).toFixed(2)}%`,
                      color: 'text-amber-400',
                    },
                  ].map(stat => (
                    <div key={stat.label} className="bg-[#070d1a] border border-slate-800/60 rounded-lg p-3">
                      <p className="text-[10px] text-slate-500 mb-1">{stat.label}</p>
                      <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
