/**
 * Funciones de Adquisición para Bayesian Optimization
 *
 * Determinan qué punto evaluar a continuación balanceando
 * exploración (alta incertidumbre) vs explotación (alta media predicha).
 */

// ─── CDF / PDF normales estándar ──────────────────────────────────────────────

/**
 * Aproximación de la CDF normal estándar Φ(z)
 * Usa la serie de Abramowitz & Stegun (error < 7.5e-8)
 */
export function normalCDF(z: number): number {
  const a1 =  0.254829592
  const a2 = -0.284496736
  const a3 =  1.421413741
  const a4 = -1.453152027
  const a5 =  1.061405429
  const p  =  0.3275911

  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1.0 + sign * y)
}

/** PDF normal estándar φ(z) */
export function normalPDF(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)
}

// ─── Expected Improvement (EI) ────────────────────────────────────────────────
/**
 * EI(x) = (μ − f_best − ξ) · Φ(Z) + σ · φ(Z)
 * donde Z = (μ − f_best − ξ) / σ
 *
 * Balance: ξ grande → más exploración, ξ pequeño → más explotación
 */
export function expectedImprovement(
  mean: number,
  variance: number,
  bestScore: number,
  xi: number = 0.01
): number {
  const sigma = Math.sqrt(variance)
  if (sigma < 1e-10) return 0

  const Z     = (mean - bestScore - xi) / sigma
  const ei    = (mean - bestScore - xi) * normalCDF(Z) + sigma * normalPDF(Z)
  return Math.max(0, ei)
}

// ─── Upper Confidence Bound (UCB) ─────────────────────────────────────────────
/**
 * UCB(x) = μ(x) + κ · σ(x)
 *
 * κ grande → más exploración (prefiere alta incertidumbre)
 * κ = 2.576 corresponde a nivel de confianza 99%
 */
export function upperConfidenceBound(
  mean: number,
  variance: number,
  kappa: number = 2.576
): number {
  return mean + kappa * Math.sqrt(variance)
}

// ─── Probability of Improvement (PI) ─────────────────────────────────────────
/**
 * PI(x) = Φ((μ − f_best − ξ) / σ)
 *
 * Más greedy que EI: sólo considera probabilidad de mejorar, no magnitud.
 */
export function probabilityOfImprovement(
  mean: number,
  variance: number,
  bestScore: number,
  xi: number = 0.01
): number {
  const sigma = Math.sqrt(variance)
  if (sigma < 1e-10) return mean > bestScore ? 1 : 0
  const Z = (mean - bestScore - xi) / sigma
  return normalCDF(Z)
}

// ─── Selector unificado ───────────────────────────────────────────────────────

export type AcquisitionFn = 'EI' | 'UCB' | 'PI'

export function acquisitionValue(
  mean: number,
  variance: number,
  bestScore: number,
  fn: AcquisitionFn,
  factor: number
): number {
  switch (fn) {
    case 'EI':  return expectedImprovement(mean, variance, bestScore, factor)
    case 'UCB': return upperConfidenceBound(mean, variance, factor)
    case 'PI':  return probabilityOfImprovement(mean, variance, bestScore, factor)
  }
}
