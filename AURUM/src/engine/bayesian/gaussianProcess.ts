/**
 * Gaussian Process (GP) — implementación desde cero en TypeScript puro
 *
 * Kernel: RBF (Squared Exponential)
 *   k(x, x') = σ² · exp(-‖x − x'‖² / (2 · l²))
 *
 * Predicción:
 *   μ*(x*)  = k*ᵀ · K⁻¹ · y
 *   σ²*(x*) = k(x*,x*) - k*ᵀ · K⁻¹ · k*
 */

export class GaussianProcess {
  private X: number[][] = []
  private y: number[]   = []
  private K_inv: number[][] | null = null
  private alpha: number[] | null = null  // K⁻¹ · y

  constructor(
    public lengthScale   = 1.0,
    public signalVariance = 1.0,
    public noiseVariance  = 1e-4
  ) {}

  // ── Kernel RBF ──────────────────────────────────────────────────────────────
  rbfKernel(x1: number[], x2: number[]): number {
    let sqDist = 0
    for (let i = 0; i < x1.length; i++) {
      sqDist += (x1[i] - x2[i]) ** 2
    }
    return this.signalVariance * Math.exp(-sqDist / (2 * this.lengthScale ** 2))
  }

  // ── Construcción de la matriz de covarianza K(X,X) ─────────────────────────
  private buildCovarianceMatrix(X: number[][]): number[][] {
    const n = X.length
    const K: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const v = this.rbfKernel(X[i], X[j])
        K[i][j] = v
        K[j][i] = v
      }
      K[i][i] += this.noiseVariance  // regularización
    }
    return K
  }

  // ── Inversión de matriz via Gauss-Jordan ────────────────────────────────────
  // Eficiente para n < 200 (nuestro caso)
  private invertMatrix(M: number[][]): number[][] {
    const n = M.length
    // Construir [M | I]
    const aug: number[][] = M.map((row, i) => {
      const r = [...row]
      for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0)
      return r
    })

    for (let col = 0; col < n; col++) {
      // Pivoteo parcial
      let maxRow = col
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row
      }
      ;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]

      const pivot = aug[col][col]
      if (Math.abs(pivot) < 1e-12) continue  // matriz singular — ignorar

      for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot

      for (let row = 0; row < n; row++) {
        if (row === col) continue
        const factor = aug[row][col]
        for (let j = 0; j < 2 * n; j++) {
          aug[row][j] -= factor * aug[col][j]
        }
      }
    }

    return aug.map(row => row.slice(n))
  }

  // ── Matrix × vector ─────────────────────────────────────────────────────────
  private matVec(M: number[][], v: number[]): number[] {
    return M.map(row => row.reduce((s, val, j) => s + val * v[j], 0))
  }

  // ── Fit: ajustar el GP a las observaciones ──────────────────────────────────
  fit(X: number[][], y: number[]): void {
    this.X = X
    this.y = y
    const K = this.buildCovarianceMatrix(X)
    this.K_inv = this.invertMatrix(K)
    this.alpha = this.matVec(this.K_inv, y)
  }

  // ── Predict: media y varianza en un punto nuevo ─────────────────────────────
  predict(xStar: number[]): { mean: number; variance: number } {
    if (!this.alpha || !this.K_inv || this.X.length === 0) {
      return { mean: 0, variance: this.signalVariance }
    }

    // k* = K(X, x*)
    const kStar = this.X.map(xi => this.rbfKernel(xi, xStar))

    // μ* = k*ᵀ · α
    const mean = kStar.reduce((s, k, i) => s + k * this.alpha![i], 0)

    // σ²* = k(x*,x*) − k*ᵀ · K⁻¹ · k*
    const kStarStarRaw = this.rbfKernel(xStar, xStar)
    const K_inv_kStar  = this.matVec(this.K_inv, kStar)
    const dot = kStar.reduce((s, k, i) => s + k * K_inv_kStar[i], 0)
    const variance = Math.max(0, kStarStarRaw - dot)

    return { mean, variance }
  }

  // ── Optimizar hyperparámetros por log-marginal-likelihood ──────────────────
  // Búsqueda en grid sobre (lengthScale, signalVariance)
  optimizeHyperparams(): void {
    if (this.X.length < 3) return

    const lsCandidates  = [0.2, 0.5, 1.0, 2.0, 5.0]
    const svCandidates  = [0.1, 0.5, 1.0, 2.0]
    let   bestLogLik    = -Infinity
    let   bestLS        = this.lengthScale
    let   bestSV        = this.signalVariance

    for (const ls of lsCandidates) {
      for (const sv of svCandidates) {
        const gp = new GaussianProcess(ls, sv, this.noiseVariance)
        const K  = gp.buildCovarianceMatrix(this.X)
        const ll = this.logMarginalLikelihood(K, this.y)
        if (ll > bestLogLik) { bestLogLik = ll; bestLS = ls; bestSV = sv }
      }
    }

    this.lengthScale    = bestLS
    this.signalVariance = bestSV
    this.fit(this.X, this.y)  // refit con nuevos hyperparámetros
  }

  // log p(y | X, θ) ≈ -½ yᵀK⁻¹y - ½ log|K| - n/2 log(2π)
  private logMarginalLikelihood(K: number[][], y: number[]): number {
    try {
      const Kinv   = this.invertMatrix(K)
      const alpha  = this.matVec(Kinv, y)
      const dataFit = -0.5 * y.reduce((s, yi, i) => s + yi * alpha[i], 0)
      // Aproximar log|K| = sum(log(diag de Cholesky))
      // Usamos la traza de K como proxy ligero
      const logDetApprox = Math.log(Math.max(1e-10, K.reduce((s, row, i) => s + row[i], 0)))
      return dataFit - 0.5 * logDetApprox
    } catch {
      return -Infinity
    }
  }
}
