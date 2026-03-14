import type { Candle } from '../../src/types'

export async function dataFetcher(
  symbol: string,
  interval: string,
  apiKey: string,
  startDate: string
): Promise<{ candles: Candle[]; source: 'live' | 'error'; error?: string }> {
  try {
    const url =
      `https://api.twelvedata.com/time_series` +
      `?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${interval}` +
      `&outputsize=5000` +
      `&start_date=${startDate}` +
      `&apikey=${apiKey}` +
      `&format=JSON`

    const resp = await fetch(url)
    if (!resp.ok) {
      return { candles: [], source: 'error', error: `HTTP ${resp.status}` }
    }

    const json = await resp.json() as {
      status?: string
      message?: string
      values?: Array<{
        datetime: string
        open: string
        high: string
        low: string
        close: string
        volume?: string
      }>
    }

    if (json.status === 'error' || !json.values) {
      return { candles: [], source: 'error', error: json.message ?? 'Unknown error' }
    }

    const candles: Candle[] = json.values
      .reverse()  // Twelve Data devuelve en orden descendente
      .map(v => ({
        date:      v.datetime,
        open:      parseFloat(v.open),
        high:      parseFloat(v.high),
        low:       parseFloat(v.low),
        close:     parseFloat(v.close),
        volume:    v.volume ? parseFloat(v.volume) : undefined,
        timestamp: new Date(v.datetime).getTime(),
      }))

    return { candles, source: 'live' }
  } catch (e: unknown) {
    return { candles: [], source: 'error', error: String(e) }
  }
}
