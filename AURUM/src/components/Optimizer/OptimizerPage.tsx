import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { ConvergenceChart } from './ConvergenceChart'
import { ScatterPlot } from './ScatterPlot'
import { BayesianOptimizer } from '../../engine/bayesian/optimizer'
import { runBacktest, calcScore } from '../../engine/backtestEngine'
import type {
  BayesianState,
  BayesianOptions,
  GridParams,
  OptimizationResult,
  Observation,
  StrategyParams,
} from '../../types'

type OptMethod = 'grid' | 'bayesian' | 'compare'

const DEFAULT_GRID: GridParams = {
  swingLookback: [8, 12, 15],
  obLookback:    [5, 8, 10],
  tp2RR:         [2.5, 3, 4],
  riskPct:       [0.5, 1, 1.5, 2],
  slBuffer:      [0.5, 1, 2],
}

const DEFAULT_BAYES_OPTIONS: BayesianOptions = {
  nInitial:         10,
  nIterations:      50,
  acquisitionFn:    'EI',
  explorationFactor: 0.01,
  nRestarts:        25,
}

// ─── Generate all grid combinations ───────────────────────────────────────────
function generateAllCombinations(grid: GridParams): StrategyParams[] {
  const results: StrategyParams[] = []
  for (const swing of grid.swingLookback)
  for (const ob of grid.obLookback)
  for (const tp2 of grid.tp2RR)
  for (const risk of grid.riskPct)
  for (const sl of grid.slBuffer) {
    results.push({ swingLookback: swing, obLookback: ob, tp1RR: 1.5, tp2RR: tp2, riskPct: risk, slBuffer: sl, compounding: true })
  }
  return results
}

// ─── Slider helper ────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step = 1, onChange, unit = '' }: {
  label: string; value: number; min: number; max: number
  step?: number; onChange: (v: number) => void; unit?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-28 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-amber-400"
      />
      <span className="text-xs font-mono text-amber-400 w-12 text-right">
        {value}{unit}
      </span>
    </div>
  )
}

// ─── Best params card ─────────────────────────────────────────────────────────
function BestParamsCard({ obs, onApply }: { obs: Observation | OptimizationResult | null; onApply?: () => void }) {
  if (!obs) return <div className="text-slate-600 text-xs">Sin resultados aún</div>
  const p = obs.params
  const m = obs.metrics
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 text-xs font-mono">
        {([
          ['swingLookback', p.swingLookback],
          ['obLookback',    p.obLookback],
          ['tp1RR',         p.tp1RR],
          ['tp2RR',         p.tp2RR],
          ['riskPct',       `${p.riskPct}%`],
          ['slBuffer',      p.slBuffer],
        ] as [string, string | number][]).map(([k, v]) => (
          <div key={k} className="flex justify-between bg-slate-800/40 px-2 py-1 rounded">
            <span className="text-slate-500">{k}</span>
            <span className="text-amber-400">{v}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-800 pt-2 space-y-1 text-xs font-mono">
        <div className="flex justify-between"><span className="text-slate-500">Score</span><span className="text-amber-400 font-bold">{obs.score.toFixed(3)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Retorno</span><span className="text-emerald-400">+{m.totalReturn.toFixed(1)}%</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Win Rate</span><span className="text-emerald-400">{m.winRate.toFixed(1)}%</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Prof. Factor</span><span className="text-emerald-400">{m.profitFactor.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Max DD</span><span className="text-red-400">-{m.maxDrawdown.toFixed(1)}%</span></div>
      </div>
      {onApply && (
        <button
          onClick={onApply}
          className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded transition-colors"
        >
          ▶ APLICAR Y BACKTEST
        </button>
      )}
    </div>
  )
}

// ─── OptimizerPage ────────────────────────────────────────────────────────────
export function OptimizerPage() {
  const {
    candles, config, setStrategyParams, setPage,
    gridResults, gridProgress, isGridRunning,
    setGridResults, setGridProgress, setGridRunning,
    bayesianState, setBayesianState,
    addSavedOptimization,
  } = useAppStore()

  const [method, setMethod] = useState<OptMethod>('bayesian')
  const [bayesOptions, setBayesOptions] = useState<BayesianOptions>(DEFAULT_BAYES_OPTIONS)
  const [scatterX, setScatterX] = useState('swingLookback')
  const [scatterY, setScatterY] = useState('tp2RR')
  const [startTime, setStartTime] = useState(0)

  // Refs to cancel in-progress async runs
  const gridCancelRef  = useRef(false)
  const bayesOptimizerRef = useRef<BayesianOptimizer | null>(null)

  // ─── Grid Search (async, in-process with setTimeout yields) ────────────────
  const runGrid = useCallback(async () => {
    if (!candles.length) return alert('Carga datos primero (ve a Backtesting)')

    // Cancel any previous run
    gridCancelRef.current = true
    await new Promise(r => setTimeout(r, 0))
    gridCancelRef.current = false

    setGridResults([])
    setGridProgress(0)
    setGridRunning(true)
    const t0 = Date.now()
    setStartTime(t0)

    try {
      const combos = generateAllCombinations(DEFAULT_GRID)
      const results: OptimizationResult[] = []
      const chunkSize = 10

      for (let i = 0; i < combos.length; i += chunkSize) {
        if (gridCancelRef.current) break

        const chunk = combos.slice(i, i + chunkSize)
        for (const params of chunk) {
          const result = runBacktest(candles, params, config.capital)
          results.push({ params, score: calcScore(result.metrics), metrics: result.metrics, rank: 0 })
        }
        const pct = Math.min(100, (i + chunkSize) / combos.length * 100)
        setGridProgress(pct)
        await new Promise(r => setTimeout(r, 0)) // yield to UI
      }

      if (!gridCancelRef.current) {
        results.sort((a, b) => b.score - a.score)
        results.forEach((r, idx) => r.rank = idx + 1)
        const top = results.slice(0, 50)
        setGridResults(top)
        if (top.length) {
          addSavedOptimization({
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            method: 'grid',
            symbol: config.symbol,
            interval: config.interval,
            capital: config.capital,
            results: top,
            bestParams: top[0].params,
            bestMetrics: top[0].metrics,
            duration: Date.now() - t0,
          })
        }
      }
    } catch (err) {
      console.error('[Grid] Error during optimization:', err)
    } finally {
      setGridRunning(false)
    }
  }, [candles, config, addSavedOptimization, setGridResults, setGridProgress, setGridRunning])

  const stopGrid = useCallback(() => {
    gridCancelRef.current = true
    setGridRunning(false)
  }, [setGridRunning])

  // ─── Bayesian Optimization (async, in-process) ──────────────────────────────
  const runBayesian = useCallback(async () => {
    if (!candles.length) return alert('Carga datos primero (ve a Backtesting)')

    // Cancel previous run
    bayesOptimizerRef.current?.stop()
    bayesOptimizerRef.current = null

    const t0 = Date.now()
    setStartTime(t0)

    setBayesianState({
      observations: [], bestObservation: null,
      iteration: 0, totalIterations: bayesOptions.nInitial + bayesOptions.nIterations,
      phase: 'initial', isRunning: true,
      convergenceHistory: [], allScores: [],
    })

    try {
      const optimizer = new BayesianOptimizer(candles, config.capital, bayesOptions)
      bayesOptimizerRef.current = optimizer

      await optimizer.run(
        (state: BayesianState) => {
          setBayesianState({ ...state })
        },
        (_obs: Observation) => {
          // best observation is already reflected in state via onProgress
        }
      )

      // Mark done
      setBayesianState(prev => prev ? { ...prev, isRunning: false, phase: 'done' } : null)

      const finalState = useAppStore.getState().bayesianState
      if (finalState?.bestObservation) {
        addSavedOptimization({
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          method: 'bayesian',
          symbol: config.symbol,
          interval: config.interval,
          capital: config.capital,
          observations: finalState.observations,
          bestParams: finalState.bestObservation.params,
          bestMetrics: finalState.bestObservation.metrics,
          duration: Date.now() - t0,
        })
      }
    } catch (err) {
      console.error('[Bayesian] Error during optimization:', err)
      setBayesianState(prev => prev ? { ...prev, isRunning: false } : null)
    } finally {
      bayesOptimizerRef.current = null
    }
  }, [candles, config, bayesOptions, addSavedOptimization, setBayesianState])

  const stopBayesian = useCallback(() => {
    bayesOptimizerRef.current?.stop()
    bayesOptimizerRef.current = null
    setBayesianState(prev => prev ? { ...prev, isRunning: false } : null)
  }, [setBayesianState])

  // ─── Aplicar mejores parámetros ─────────────────────────────────────────────
  const applyBest = (params: typeof gridResults[0]['params']) => {
    setStrategyParams(params)
    setPage('backtesting')
  }

  // ─── Comparativa ────────────────────────────────────────────────────────────
  const gridBest  = gridResults[0]
  const bayesBest = bayesianState?.bestObservation

  const isRunning = (method === 'grid' && isGridRunning) || (method === 'bayesian' && bayesianState?.isRunning)

  const totalIter = bayesOptions.nInitial + bayesOptions.nIterations
  const bayesProgress = bayesianState ? (bayesianState.iteration / totalIter) * 100 : 0
  const phaseLabel = bayesianState?.phase === 'initial'
    ? `Exploración inicial (${bayesianState.iteration}/${bayesOptions.nInitial})`
    : bayesianState?.phase === 'bayesian'
    ? `Bayesian optimization (${bayesianState.iteration - bayesOptions.nInitial}/${bayesOptions.nIterations})`
    : 'Completado'

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-4">

      {/* ── Selector de método ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 mr-2">MÉTODO:</span>
        {(['grid', 'bayesian', 'compare'] as OptMethod[]).map(m => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${
              method === m
                ? 'bg-amber-500 text-black'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {m === 'grid' ? '⊞ Grid Search' : m === 'bayesian' ? '⚡ Bayesian' : '⇄ Comparar'}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-600">
          {candles.length} velas · {config.symbol} {config.interval}
        </span>
      </div>

      {/* ── Contenido según método ────────────────────────────────────────── */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Panel izquierdo: configuración + progreso + mejor resultado */}
        <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">

          {/* Config Grid Search */}
          {method === 'grid' && (
            <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Grid Search</h3>
              <p className="text-xs text-slate-600 mb-3">
                {Object.values(DEFAULT_GRID).reduce((t, arr) => t * arr.length, 1)} combinaciones fijas
              </p>
              <div className="flex gap-2">
                <button
                  onClick={isGridRunning ? stopGrid : runGrid}
                  disabled={method !== 'grid'}
                  className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${
                    isGridRunning
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-black'
                  }`}
                >
                  {isGridRunning ? '■ DETENER' : '⊞ INICIAR GRID'}
                </button>
              </div>
              {isGridRunning && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Progreso</span><span>{gridProgress.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${gridProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Config Bayesian */}
          {(method === 'bayesian' || method === 'compare') && (
            <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">⚡ Bayesian Optimization</h3>
              <div className="space-y-3 mb-4">
                <Slider label="Iter. iniciales" value={bayesOptions.nInitial} min={5} max={20}
                  onChange={v => setBayesOptions(o => ({ ...o, nInitial: v }))} />
                <Slider label="Iter. BO" value={bayesOptions.nIterations} min={10} max={150}
                  onChange={v => setBayesOptions(o => ({ ...o, nIterations: v }))} />
                <Slider label="Restarts" value={bayesOptions.nRestarts} min={5} max={50}
                  onChange={v => setBayesOptions(o => ({ ...o, nRestarts: v }))} />

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-28">Función acq.</span>
                  <select
                    value={bayesOptions.acquisitionFn}
                    onChange={e => setBayesOptions(o => ({ ...o, acquisitionFn: e.target.value as 'EI'|'UCB'|'PI' }))}
                    className="flex-1 bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded border border-slate-700"
                  >
                    <option value="EI">EI — Expected Improvement</option>
                    <option value="UCB">UCB — Upper Confidence Bound</option>
                    <option value="PI">PI — Probability of Improvement</option>
                  </select>
                </div>

                <Slider
                  label={bayesOptions.acquisitionFn === 'UCB' ? 'κ (kappa)' : 'ξ (xi)'}
                  value={bayesOptions.explorationFactor}
                  min={0.001} max={bayesOptions.acquisitionFn === 'UCB' ? 5 : 0.5}
                  step={0.001}
                  onChange={v => setBayesOptions(o => ({ ...o, explorationFactor: v }))}
                />
              </div>

              {/* Espacio de búsqueda */}
              <div className="border-t border-slate-800 pt-3 mb-3">
                <p className="text-xs text-slate-600 mb-2">Espacio de búsqueda:</p>
                {(['swingLookback','obLookback','tp1RR','tp2RR','riskPct','slBuffer'] as const).map(k => {
                  const bounds: Record<string, [number, number]> = {
                    swingLookback: [5, 25], obLookback: [3, 15],
                    tp1RR: [1, 2.5], tp2RR: [1.5, 6],
                    riskPct: [0.5, 3], slBuffer: [0.2, 3],
                  }
                  const [lo, hi] = bounds[k]
                  return (
                    <div key={k} className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
                      <span className="w-24">{k}</span>
                      <span className="text-slate-700">[{lo} – {hi}]</span>
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={bayesianState?.isRunning ? stopBayesian : runBayesian}
                  className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${
                    bayesianState?.isRunning
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-black'
                  }`}
                >
                  {bayesianState?.isRunning ? '■ DETENER' : '⚡ INICIAR BAYESIAN'}
                </button>
              </div>
            </div>
          )}

          {/* Progreso Bayesian */}
          {bayesianState && method !== 'grid' && (
            <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Iteración</span>
                <span className="text-amber-400 font-mono">{bayesianState.iteration}/{totalIter}</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full mb-2">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${bayesProgress}%` }} />
              </div>
              <p className="text-xs text-slate-600">{phaseLabel}</p>
              {bayesianState.bestObservation && (
                <p className="text-xs text-amber-400/70 mt-1">
                  Mejor score: <span className="font-bold text-amber-400">{bayesianState.bestObservation.score.toFixed(4)}</span>
                </p>
              )}
            </div>
          )}

          {/* Mejor resultado */}
          <div className="bg-[#070d1a] border border-amber-500/20 rounded-lg p-4">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">
              {method === 'grid' ? '⊞ MEJOR (GRID)' : '⚡ MEJOR (BAYESIAN)'}
            </h3>
            <BestParamsCard
              obs={method === 'grid' ? gridBest : bayesBest}
              onApply={() => {
                const best = method === 'grid' ? gridBest : bayesBest
                if (best) applyBest(best.params)
              }}
            />
          </div>
        </div>

        {/* Panel derecho: gráficos + tabla */}
        <div className="flex-1 flex flex-col gap-3 min-h-0 min-w-0">

          {/* Gráficos */}
          <div className="flex gap-3 h-52 shrink-0">
            {/* Convergencia */}
            <div className="flex-1 bg-[#070d1a] border border-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-2">Convergencia</p>
              {bayesianState && (bayesianState.convergenceHistory?.length ?? 0) > 0 ? (
                <div className="h-36">
                  <ConvergenceChart
                    convergenceHistory={bayesianState.convergenceHistory}
                    allScores={bayesianState.allScores}
                    nInitial={bayesOptions.nInitial}
                  />
                </div>
              ) : (
                <div className="h-36 flex items-center justify-center text-slate-700 text-xs">
                  Sin datos — inicia Bayesian Optimization
                </div>
              )}
            </div>

            {/* Scatter plot */}
            <div className="flex-1 bg-[#070d1a] border border-slate-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs text-slate-500">Espacio explorado</p>
                <select value={scatterX} onChange={e => setScatterX(e.target.value)}
                  className="ml-auto bg-slate-800 text-slate-400 text-xs px-1 py-0.5 rounded">
                  {['swingLookback','obLookback','tp1RR','tp2RR','riskPct','slBuffer'].map(k =>
                    <option key={k} value={k}>{k}</option>
                  )}
                </select>
                <span className="text-slate-600 text-xs">vs</span>
                <select value={scatterY} onChange={e => setScatterY(e.target.value)}
                  className="bg-slate-800 text-slate-400 text-xs px-1 py-0.5 rounded">
                  {['tp2RR','swingLookback','obLookback','tp1RR','riskPct','slBuffer'].map(k =>
                    <option key={k} value={k}>{k}</option>
                  )}
                </select>
              </div>
              {bayesianState && (bayesianState.observations?.length ?? 0) > 0 ? (
                <div className="h-36">
                  <ScatterPlot
                    observations={bayesianState.observations}
                    xKey={scatterX}
                    yKey={scatterY}
                  />
                </div>
              ) : (
                <div className="h-36 flex items-center justify-center text-slate-700 text-xs">
                  Sin observaciones
                </div>
              )}
            </div>
          </div>

          {/* Comparativa Grid vs Bayesian */}
          {method === 'compare' && gridBest && bayesBest && (
            <div className="bg-[#070d1a] border border-slate-800 rounded-lg p-4 shrink-0">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">⇄ COMPARATIVA</h3>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-slate-600 border-b border-slate-800">
                    <th className="text-left py-1">Métrica</th>
                    <th className="text-right py-1">Grid Search</th>
                    <th className="text-right py-1">Bayesian</th>
                    <th className="text-right py-1">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['Evaluaciones', '324', String(bayesOptions.nInitial + bayesOptions.nIterations)],
                    ['Score', gridBest.score.toFixed(3), bayesBest.score.toFixed(3)],
                    ['Retorno', `+${gridBest.metrics.totalReturn.toFixed(1)}%`, `+${bayesBest.metrics.totalReturn.toFixed(1)}%`],
                    ['Win Rate', `${gridBest.metrics.winRate.toFixed(1)}%`, `${bayesBest.metrics.winRate.toFixed(1)}%`],
                    ['Prof. Factor', gridBest.metrics.profitFactor.toFixed(2), bayesBest.metrics.profitFactor.toFixed(2)],
                    ['Max DD', `-${gridBest.metrics.maxDrawdown.toFixed(1)}%`, `-${bayesBest.metrics.maxDrawdown.toFixed(1)}%`],
                  ] as [string, string, string][]).map(([label, g, b]) => {
                    const gn = parseFloat(g.replace(/[^0-9.-]/g, ''))
                    const bn = parseFloat(b.replace(/[^0-9.-]/g, ''))
                    const better = bn > gn
                    const diff = !isNaN(gn) && !isNaN(bn) ? (bn - gn).toFixed(2) : '—'
                    return (
                      <tr key={label} className="border-b border-slate-800/30">
                        <td className="py-1.5 text-slate-500">{label}</td>
                        <td className="py-1.5 text-right text-slate-400">{g}</td>
                        <td className={`py-1.5 text-right font-bold ${better ? 'text-emerald-400' : 'text-slate-300'}`}>{b}</td>
                        <td className={`py-1.5 text-right text-xs ${better ? 'text-emerald-400' : 'text-red-400'}`}>
                          {better ? '▲' : '▼'} {diff}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Historial de observaciones Bayesian */}
          {bayesianState && (bayesianState.observations?.length ?? 0) > 0 && (
            <div className="flex-1 bg-[#070d1a] border border-slate-800 rounded-lg overflow-hidden min-h-0">
              <div className="p-3 border-b border-slate-800">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Historial de Observaciones ({bayesianState.observations?.length ?? 0})
                </h3>
              </div>
              <div className="overflow-auto h-full">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-[#070d1a]">
                    <tr className="text-slate-600 border-b border-slate-800">
                      {['#','Fase','sLB','obLB','tp1','tp2','risk%','slBuf','Score','Return','WR','DD'].map(h =>
                        <th key={h} className="text-right py-2 px-2 first:text-left">{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[...bayesianState.observations]
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 50)
                      .map((obs, i) => {
                        const isBest = obs === bayesianState.bestObservation
                        return (
                          <tr key={obs.iteration} className={`border-b border-slate-800/30 ${isBest ? 'bg-amber-500/5' : 'hover:bg-slate-800/20'}`}>
                            <td className="py-1.5 px-2 text-slate-500">
                              {isBest ? '★' : i + 1}
                            </td>
                            <td className="py-1.5 px-2 text-slate-600">
                              {obs.iteration < bayesOptions.nInitial ? 'init' : 'BO'}
                            </td>
                            <td className="py-1.5 px-2 text-right text-slate-400">{obs.params.swingLookback}</td>
                            <td className="py-1.5 px-2 text-right text-slate-400">{obs.params.obLookback}</td>
                            <td className="py-1.5 px-2 text-right text-slate-400">{obs.params.tp1RR}</td>
                            <td className="py-1.5 px-2 text-right text-slate-400">{obs.params.tp2RR}</td>
                            <td className="py-1.5 px-2 text-right text-slate-400">{obs.params.riskPct}</td>
                            <td className="py-1.5 px-2 text-right text-slate-400">{obs.params.slBuffer}</td>
                            <td className={`py-1.5 px-2 text-right font-bold ${isBest ? 'text-amber-400' : 'text-slate-300'}`}>
                              {obs.score.toFixed(3)}
                            </td>
                            <td className="py-1.5 px-2 text-right text-emerald-400">+{obs.metrics.totalReturn.toFixed(1)}%</td>
                            <td className="py-1.5 px-2 text-right text-slate-400">{obs.metrics.winRate.toFixed(1)}%</td>
                            <td className="py-1.5 px-2 text-right text-red-400">-{obs.metrics.maxDrawdown.toFixed(1)}%</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Resultados Grid */}
          {method === 'grid' && gridResults.length > 0 && (
            <div className="flex-1 bg-[#070d1a] border border-slate-800 rounded-lg overflow-hidden min-h-0">
              <div className="p-3 border-b border-slate-800">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Top Grid Results ({gridResults.length})
                </h3>
              </div>
              <div className="overflow-auto h-full">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-[#070d1a]">
                    <tr className="text-slate-600 border-b border-slate-800">
                      {['#','sLB','obLB','tp2','risk%','slBuf','Score','Return','WR','PF','DD'].map(h =>
                        <th key={h} className="text-right py-2 px-2 first:text-left">{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {gridResults.map((r, i) => (
                      <tr
                        key={i}
                        className={`border-b border-slate-800/30 cursor-pointer hover:bg-slate-800/30 ${i === 0 ? 'bg-amber-500/5' : ''}`}
                        onClick={() => applyBest(r.params)}
                      >
                        <td className="py-1.5 px-2 text-slate-500">{i === 0 ? '★' : i + 1}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{r.params.swingLookback}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{r.params.obLookback}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{r.params.tp2RR}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{r.params.riskPct}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{r.params.slBuffer}</td>
                        <td className={`py-1.5 px-2 text-right font-bold ${i === 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                          {r.score.toFixed(3)}
                        </td>
                        <td className="py-1.5 px-2 text-right text-emerald-400">+{r.metrics.totalReturn.toFixed(1)}%</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{r.metrics.winRate.toFixed(1)}%</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{r.metrics.profitFactor.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-right text-red-400">-{r.metrics.maxDrawdown.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
