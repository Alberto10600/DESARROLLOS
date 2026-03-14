import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Data ────────────────────────────────────────────────────────────────────
  fetchCandles: (symbol: string, interval: string, apiKey: string, startDate: string) =>
    ipcRenderer.invoke('fetch-candles', symbol, interval, apiKey, startDate),

  // ── Store ────────────────────────────────────────────────────────────────────
  getApiKey:     ()                    => ipcRenderer.invoke('store-get', 'apiKey'),
  setApiKey:     (key: string)         => ipcRenderer.invoke('store-set', 'apiKey', key),
  getConfig:     ()                    => ipcRenderer.invoke('store-get', 'config'),
  setConfig:     (config: unknown)     => ipcRenderer.invoke('store-set', 'config', config),
  getCachedData: (key: string)         => ipcRenderer.invoke('store-get', key),
  setCachedData: (key: string, data: unknown) => ipcRenderer.invoke('store-set', key, data),
  deleteStore:   (key: string)         => ipcRenderer.invoke('store-delete', key),

  // ── System ───────────────────────────────────────────────────────────────────
  getVersion:   () => ipcRenderer.invoke('get-version'),
  getPlatform:  () => process.platform,
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // ── Window controls ──────────────────────────────────────────────────────────
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close:    () => ipcRenderer.send('win-close'),
})

// Tipo global para TypeScript en el renderer
export type ElectronAPI = typeof import('./preload')
