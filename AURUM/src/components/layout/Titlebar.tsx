import React from 'react'

export function Titlebar() {
  const isElectron = !!window.electronAPI
  const platform   = window.electronAPI?.getPlatform() ?? 'web'

  return (
    <div
      className="flex items-center justify-between h-10 px-4 select-none"
      style={{
        backgroundColor: '#02050a',
        WebkitAppRegion: 'drag' as unknown as undefined,
      } as React.CSSProperties}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-amber-500 flex items-center justify-center">
          <span className="text-xs font-black text-black">A</span>
        </div>
        <span className="text-amber-400 font-bold text-sm tracking-widest">AURUM</span>
        <span className="text-slate-600 text-xs ml-2">v1.0.0</span>
      </div>

      {/* Window controls */}
      {isElectron && (
        <div
          className="flex items-center gap-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {platform === 'darwin' ? (
            // macOS style
            <>
              <button
                onClick={() => window.electronAPI?.close()}
                className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
              />
              <button
                onClick={() => window.electronAPI?.minimize()}
                className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors"
              />
              <button
                onClick={() => window.electronAPI?.maximize()}
                className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors"
              />
            </>
          ) : (
            // Windows style
            <>
              <button
                onClick={() => window.electronAPI?.minimize()}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white rounded transition-colors text-xs"
              >
                ─
              </button>
              <button
                onClick={() => window.electronAPI?.maximize()}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white rounded transition-colors text-xs"
              >
                ▢
              </button>
              <button
                onClick={() => window.electronAPI?.close()}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-red-600 hover:text-white rounded transition-colors text-xs"
              >
                ✕
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
