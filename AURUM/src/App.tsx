import { useAppStore } from './store/useAppStore'
import { Titlebar } from './components/layout/Titlebar'
import { Sidebar } from './components/layout/Sidebar'
import { BacktestPage } from './components/BacktestPage'
import { OptimizerPage } from './components/Optimizer/OptimizerPage'
import { TradesTable } from './components/panels/TradesTable'
import { SettingsPage } from './components/SettingsPage'
import { ErrorBoundary } from './components/ErrorBoundary'

function Dashboard() {
  const { backtestResult, config } = useAppStore()
  if (!backtestResult) {
    return (
      <div className="flex items-center justify-center h-full text-slate-700">
        <div className="text-center">
          <div className="text-5xl mb-4">◈</div>
          <p className="text-base text-slate-500">Bienvenido a AURUM</p>
          <p className="text-sm mt-2">Ve a Backtesting para ejecutar tu primera simulación</p>
        </div>
      </div>
    )
  }
  const m = backtestResult.metrics
  return (
    <div className="p-6 grid grid-cols-3 gap-4">
      {([
        ['Retorno Total', `+${m.totalReturn.toFixed(1)}%`, 'text-emerald-400'],
        ['CAGR', `${m.cagr.toFixed(1)}%/año`, 'text-amber-400'],
        ['Win Rate', `${m.winRate.toFixed(1)}%`, 'text-slate-200'],
        ['Profit Factor', m.profitFactor.toFixed(2), 'text-slate-200'],
        ['Max Drawdown', `-${m.maxDrawdown.toFixed(1)}%`, 'text-red-400'],
        ['Sharpe Ratio', m.sharpeRatio.toFixed(2), 'text-slate-200'],
      ] as [string, string, string][]).map(([label, value, color]) => (
        <div key={label} className="bg-[#070d1a] border border-slate-800 rounded-lg p-5">
          <p className="text-xs text-slate-500 mb-1">{label}</p>
          <p className={`text-3xl font-bold font-mono ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  )
}

export function App() {
  const { currentPage, backtestResult } = useAppStore()

  return (
    <div className="flex flex-col h-screen bg-[#040810] text-slate-200 overflow-hidden">
      <Titlebar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden">
          {currentPage === 'dashboard'   && <ErrorBoundary><Dashboard /></ErrorBoundary>}
          {currentPage === 'backtesting' && <ErrorBoundary><BacktestPage /></ErrorBoundary>}
          {currentPage === 'optimizer'   && <ErrorBoundary><OptimizerPage /></ErrorBoundary>}
          {currentPage === 'trades'      && (
            <ErrorBoundary>
              <div className="h-full overflow-hidden">
                {backtestResult ? (
                  <TradesTable trades={backtestResult.trades} />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-600">
                    Ejecuta un backtest primero
                  </div>
                )}
              </div>
            </ErrorBoundary>
          )}
          {currentPage === 'settings'    && <ErrorBoundary><SettingsPage /></ErrorBoundary>}
        </main>
      </div>
    </div>
  )
}
