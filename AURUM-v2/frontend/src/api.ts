const BASE = '/api'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? res.statusText)
  }
  return res.json()
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(res.statusText)
  return res.json()
}

export const api = {
  health:       ()        => get<{ status: string; ibkr: boolean }>('/health'),
  candles:      (symbol: string, interval: string, start: string) =>
                  get(`/data/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&start=${start}`),
  backtest:     (body: unknown) => post('/backtest/run', body),
  multiAsset:   (body: unknown) => post('/backtest/multi-asset', body),
  ibkrConnect:  (body: unknown) => post('/ibkr/connect', body),
  ibkrDisconnect: ()   => post('/ibkr/disconnect', {}),
  ibkrStatus:   ()     => get<{ connected: boolean; account: string; equity: number }>('/ibkr/status'),
  ibkrPositions:()     => get<unknown[]>('/ibkr/positions'),
  deploy:       (body: unknown) => post('/strategy/deploy', body),
  stopStrategy: ()     => post('/strategy/stop', {}),
}
