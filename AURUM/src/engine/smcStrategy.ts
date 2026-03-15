/**
 * SMC Strategy Engine — v2
 * Detecta señales basadas en Smart Money Concepts:
 *   1. Swing High/Low
 *   2. Liquidity Sweep (con filtro de extensión mínima)
 *   3. CHoCH (Change of Character)
 *   4. Order Block (OB) — solo OBs de calidad (body ratio)
 *   5. FVG (Fair Value Gap) — confluencia con el OB
 *   6. Mitigation check — OBs ya testeados son descartados
 *   7. Entry al retesteo del OB
 */

import type { Candle, StrategyParams } from '../types'

// ─── Market Regime ────────────────────────────────────────────────────────────

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile'

export interface RegimeAnalysis {
  regime: MarketRegime
  adx: number          // ADX value (trend strength 0-100)
  atrPct: number       // ATR as % of price (volatility)
  efficiency: number   // directional efficiency 0-1 (1 = perfect trend)
  bias: 'bullish' | 'bearish' | 'neutral'
}

/**
 * Detecta el régimen de mercado usando:
 * - ADX aproximado (fuerza de tendencia)
 * - ATR normalizado (volatilidad)
 * - Eficiencia direccional (trending vs ranging)
 * - EMA slope (dirección de la tendencia)
 */
export function detectRegime(candles: Candle[], lookback = 20): RegimeAnalysis {
  const n = candles.length
  if (n < lookback + 2) {
    return { regime: 'ranging', adx: 0, atrPct: 0, efficiency: 0, bias: 'neutral' }
  }

  const end = n - 1
  const start = end - lookback

  // ── ATR (volatilidad) ───────────────────────────────────────────────────
  let atrSum = 0
  for (let i = start + 1; i <= end; i++) {
    atrSum += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close)
    )
  }
  const atr = atrSum / lookback
  const atrPct = candles[end].close > 0 ? (atr / candles[end].close) * 100 : 0

  // ── Eficiencia direccional ───────────────────────────────────────────────
  // Ratio: desplazamiento neto / camino total recorrido
  const netMove   = Math.abs(candles[end].close - candles[start].close)
  let totalPath = 0
  for (let i = start + 1; i <= end; i++) {
    totalPath += Math.abs(candles[i].close - candles[i - 1].close)
  }
  const efficiency = totalPath > 0 ? netMove / totalPath : 0

  // ── ADX aproximado (DI+ vs DI-) ─────────────────────────────────────────
  let diPlus = 0, diMinus = 0
  for (let i = start + 1; i <= end; i++) {
    const upMove   = candles[i].high - candles[i - 1].high
    const downMove = candles[i - 1].low - candles[i].low
    const trueRange = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close)
    )
    if (trueRange > 0) {
      if (upMove > downMove && upMove > 0)   diPlus  += (upMove   / trueRange) * 100
      if (downMove > upMove && downMove > 0) diMinus += (downMove / trueRange) * 100
    }
  }
  diPlus  /= lookback
  diMinus /= lookback
  const diDiff = Math.abs(diPlus - diMinus)
  const diSum  = diPlus + diMinus
  const adx    = diSum > 0 ? (diDiff / diSum) * 100 : 0

  // ── EMA slope para bias ───────────────────────────────────────────────────
  const ema50End   = getEMA(candles, 50, end)
  const ema50Start = getEMA(candles, 50, Math.max(0, end - 10))
  const slope = ema50End - ema50Start
  const bias: RegimeAnalysis['bias'] = slope > atr * 0.5 ? 'bullish' : slope < -atr * 0.5 ? 'bearish' : 'neutral'

  // ── Clasificar régimen ────────────────────────────────────────────────────
  let regime: MarketRegime
  if (atrPct > 3) {
    regime = 'volatile'
  } else if (adx > 25 && efficiency > 0.4) {
    regime = diPlus > diMinus ? 'trending_up' : 'trending_down'
  } else {
    regime = 'ranging'
  }

  return { regime, adx, atrPct, efficiency, bias }
}

// ─── Signal Internal Types ────────────────────────────────────────────────────

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

/**
 * Detecta Fair Value Gap (FVG / Imbalance) entre dos índices.
 * Un FVG alcista existe cuando candle[n].high < candle[n+2].low (gap up).
 * Un FVG bajista existe cuando candle[n].low > candle[n+2].high (gap down).
 * Buscamos un FVG entre el OB y la vela de sweep que refuerce el setup.
 */
function hasFVG(candles: Candle[], fromIdx: number, toIdx: number, direction: 'LONG' | 'SHORT'): boolean {
  for (let i = fromIdx; i <= toIdx - 2; i++) {
    if (i < 0 || i + 2 >= candles.length) continue
    if (direction === 'LONG') {
      // FVG alcista: hueco entre high[i] y low[i+2]
      if (candles[i].high < candles[i + 2].low) return true
    } else {
      // FVG bajista: hueco entre low[i] y high[i+2]
      if (candles[i].low > candles[i + 2].high) return true
    }
  }
  return false
}

/**
 * Verifica si el Order Block ha sido mitigado (ya testeado) entre obIndex y sweepIndex.
 * Un OB bajista es mitigado si price ha subido hasta ob.high después de su formación.
 * Un OB alcista es mitigado si price ha bajado hasta ob.low después de su formación.
 */
function isOBMitigated(
  candles: Candle[],
  obIndex: number,
  sweepIndex: number,
  direction: 'LONG' | 'SHORT',
  obHigh: number,
  obLow: number
): boolean {
  for (let i = obIndex + 1; i < sweepIndex; i++) {
    if (i >= candles.length) break
    if (direction === 'SHORT') {
      // OB bajista: si precio regresó al high del OB entre formación y sweep, está mitigado
      if (candles[i].high >= obHigh) return true
    } else {
      // OB alcista: si precio regresó al low del OB entre formación y sweep, está mitigado
      if (candles[i].low <= obLow) return true
    }
  }
  return false
}

/**
 * Calidad del Order Block: ratio del cuerpo respecto al rango total.
 * Un OB fuerte tiene un cuerpo grande (> 40% del rango total de la vela).
 */
function obBodyRatio(candle: Candle): number {
  const range = candle.high - candle.low
  if (range <= 0) return 0
  return Math.abs(candle.close - candle.open) / range
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
    // Nuevos parámetros v2
    obMinBodyRatio = 0.35,      // OB debe tener cuerpo ≥ 35% del rango
    requireFVG = false,          // Requerir FVG como confluencia
    checkMitigation = true,      // Descartar OBs ya mitigados
    minSweepExtPct = 0,          // % mínimo de extensión del wick sobre el swing (0 = desactivado)
    regimeFilter = false,        // Filtrar por régimen de mercado (solo operar en tendencia)
  } = params

  // ── Régimen de mercado (calculado una vez al inicio) ───────────────────────
  const regime = regimeFilter ? detectRegime(candles) : null

  const signals: Signal[] = []
  const minPeriod = Math.max(swingLookback, obLookback) + 5

  for (let i = minPeriod; i < candles.length - 2; i++) {
    // ── Filtro de régimen de mercado ──────────────────────────────────────────
    // Recalcular régimen local en ventana de 50 velas para adaptación dinámica
    if (regimeFilter && i % 50 === 0) {
      const localRegime = detectRegime(candles.slice(Math.max(0, i - 60), i + 1))
      // En mercados ranging o muy volátiles, no operar
      if (localRegime.regime === 'volatile') continue
      // Filtrar dirección: en trending_up solo LONG, en trending_down solo SHORT
      // (esto se aplica más abajo al construir la señal)
    }

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
      // Filtro de extensión mínima del sweep
      if (minSweepExtPct > 0) {
        const extPct = (c.high - swingHigh) / swingHigh * 100
        if (extPct < minSweepExtPct) continue
      }

      // Buscar Order Block: última vela alcista antes del impulso bajista
      let obIndex = -1
      for (let k = i - 1; k >= Math.max(0, i - obLookback); k--) {
        if (candles[k].close > candles[k].open) {
          // Filtro de calidad del OB
          if (obBodyRatio(candles[k]) >= obMinBodyRatio) {
            obIndex = k
            break
          }
        }
      }
      if (obIndex < 0) continue

      const ob = candles[obIndex]

      // ── Mitigation check: OB no debe haber sido ya testeado
      if (checkMitigation && isOBMitigated(candles, obIndex, i, 'SHORT', ob.high, ob.low)) continue

      // ── FVG confluence (opcional)
      if (requireFVG && !hasFVG(candles, obIndex, i, 'SHORT')) continue

      const sl   = ob.high + slBuffer
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
      // Filtro de extensión mínima del sweep
      if (minSweepExtPct > 0) {
        const extPct = (swingLow - c.low) / swingLow * 100
        if (extPct < minSweepExtPct) continue
      }

      // Buscar Order Block: última vela bajista antes del impulso alcista
      let obIndex = -1
      for (let k = i - 1; k >= Math.max(0, i - obLookback); k--) {
        if (candles[k].close < candles[k].open) {
          // Filtro de calidad del OB
          if (obBodyRatio(candles[k]) >= obMinBodyRatio) {
            obIndex = k
            break
          }
        }
      }
      if (obIndex < 0) continue

      const ob = candles[obIndex]

      // ── Mitigation check: OB no debe haber sido ya testeado
      if (checkMitigation && isOBMitigated(candles, obIndex, i, 'LONG', ob.high, ob.low)) continue

      // ── FVG confluence (opcional)
      if (requireFVG && !hasFVG(candles, obIndex, i, 'LONG')) continue

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
