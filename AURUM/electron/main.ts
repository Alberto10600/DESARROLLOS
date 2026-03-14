import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron'
import path from 'path'
import Store from 'electron-store'
import { dataFetcher } from './ipc/dataFetcher'

const store = new Store()
const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: false,                    // Titlebar custom
    backgroundColor: '#040810',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  Menu.setApplicationMenu(null)

  if (isDev) {
    win.loadURL('http://localhost:5173')
    // win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // ── Window controls (frameless) ──────────────────────────────────────────
  ipcMain.on('win-minimize', () => win.minimize())
  ipcMain.on('win-maximize', () => {
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on('win-close', () => win.close())
}

app.whenReady().then(() => {
  createWindow()
  setupIpcHandlers()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

function setupIpcHandlers(): void {
  // Fetch de velas desde Twelve Data (sin CORS desde main process)
  ipcMain.handle('fetch-candles', async (_, symbol: string, interval: string, apiKey: string, startDate: string) => {
    return dataFetcher(symbol, interval, apiKey, startDate)
  })

  // electron-store: get/set genérico
  ipcMain.handle('store-get', (_, key: string) => store.get(key))
  ipcMain.handle('store-set', (_, key: string, value: unknown) => {
    store.set(key, value)
    return true
  })
  ipcMain.handle('store-delete', (_, key: string) => {
    store.delete(key)
    return true
  })

  // Abrir URL en el navegador del sistema
  ipcMain.handle('open-external', (_, url: string) => shell.openExternal(url))

  // Versión de la app
  ipcMain.handle('get-version', () => app.getVersion())

  // Plataforma
  ipcMain.handle('get-platform', () => process.platform)
}
