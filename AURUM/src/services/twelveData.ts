/**
 * TwelveData service — wrapper sobre el IPC bridge de Electron.
 * En modo web (sin Electron) usa datos demo para desarrollo.
 */

import type { Candle } from '../types'

declare global {
  interface Window {
    electronAPI?: {
      fetchCandles: (symbol: string, interval: string, apiKey: string, startDate: string) => Promise<{ candles: Candle[]; source: string; error?: string }>
      getCachedData: (key: string) => Promise<unknown>
      setCachedData: (key: string, data: unknown) => Promise<void>
      getApiKey: () => Promise<string>
      setApiKey: (key: string) => Promise<void>
      getConfig: () => Promise<unknown>
      setConfig: (config: unknown) => Promise<void>
      getVersion: () => Promise<string>
      getPlatform: () => string
      openExternal: (url: string) => Promise<void>
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000  // 24 horas

export async function fetchCandles(
  symbol: string,
  interval: string,
  apiKey: string,
  startDate: string
): Promise<{ candles: Candle[]; source: 'live' | 'cache' | 'demo' }> {
  // Sin Electron → devolver datos demo
  if (!window.electronAPI) {
    return { candles: generateDemoCandles(), source: 'demo' }
  }

  const cacheKey = `cache_${symbol}_${interval}_${startDate}`

  // Comprobar caché
  const cached = await window.electronAPI.getCachedData(cacheKey) as
    | { candles: Candle[]; timestamp: number }
    | null

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { candles: cached.candles, source: 'cache' }
  }

  // Fetch live
  const result = await window.electronAPI.fetchCandles(symbol, interval, apiKey, startDate)
  if (result.error || result.candles.length === 0) {
    // Fallback a caché expirada si existe
    if (cached) return { candles: cached.candles, source: 'cache' }
    throw new Error(result.error ?? 'No data returned')
  }

  // Guardar en caché
  await window.electronAPI.setCachedData(cacheKey, { candles: result.candles, timestamp: Date.now() })
  return { candles: result.candles, source: 'live' }
}

// ─── Demo Data Generator ─────────────────────────────────────────────────────
// Genera ~1800 velas diarias realistas de XAU/USD (2019-2024)
function generateDemoCandles(): Candle[] {
  const candles: Candle[] = []
  let price = 1280
  const startDate = new Date('2019-01-01').getTime()
  const dayMs = 86400 * 1000

  // Puntos de precio clave (XAU/USD real aproximado)
  const pivots: [number, number][] = [
    [0,    1280],
    [200,  1560],   // Rally 2019
    [365,  1740],   // Inicio COVID fear
    [420,  1900],   // Crash COVID mar 2020
    [380,  1680],   // Rebote
    [550,  2075],   // ATH agosto 2020
    [750,  1680],   // Corrección 2021
    [900,  1780],   // Rebote fin 2021
    [960,  2070],   // Invasión Ucrania mar 2022
    [1050, 1620],   // Fed hawkish 2022
    [1200, 1850],   // Rebote 2023
    [1400, 2050],   // Rally 2023-2024
    [1600, 2350],   // Nuevo ATH 2024
    [1800, 2300],   // Consolidación
  ]

  const totalDays = 1826  // 5 años

  for (let d = 0; d < totalDays; d++) {
    // Interpolación del precio objetivo
    let target = price
    for (let p = 0; p < pivots.length - 1; p++) {
      if (d >= pivots[p][0] && d < pivots[p + 1][0]) {
        const t = (d - pivots[p][0]) / (pivots[p + 1][0] - pivots[p][0])
        target = pivots[p][1] + t * (pivots[p + 1][1] - pivots[p][1])
        break
      }
    }

    // Movimiento diario aleatorio con media reverting hacia target
    const drift = (target - price) * 0.02
    const vol   = price * 0.008
    const change = drift + (Math.random() - 0.5) * 2 * vol

    const open = price
    price += change

    const range = Math.abs(change) * (1 + Math.random() * 2)
    const high  = Math.max(open, price) + Math.random() * range * 0.5
    const low   = Math.min(open, price) - Math.random() * range * 0.5
    const close = price

    const ts = startDate + d * dayMs
    const date = new Date(ts).toISOString().slice(0, 10)

    // Saltar fines de semana
    const dow = new Date(ts).getDay()
    if (dow === 0 || dow === 6) continue

    candles.push({
      date,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low:  Math.round(low  * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.floor(Math.random() * 50000 + 10000),
      timestamp: ts,
    })
  }

  return candles
}
