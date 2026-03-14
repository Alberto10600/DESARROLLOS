/**
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
      // Solo trades en dirección de la tendencia se considerarán más adelante
      // aquí solo calculamos para validar
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

      // Validar dirección con tendencia
      if (trendFilter !== 'none') {
        const period = trendFilter === 'ema50' ? 50 : 200
        const ema = getEMA(candles, period, i)
        if (ob.low > ema) continue  // OB por encima de EMA → skip SHORT
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

      // Validar dirección con tendencia
      if (trendFilter !== 'none') {
        const period = trendFilter === 'ema50' ? 50 : 200
        const ema = getEMA(candles, period, i)
        if (ob.high < ema) continue  // OB por debajo de EMA → skip LONG
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
}
