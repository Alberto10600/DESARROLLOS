# AURUM — Algorithmic Trading Backtester

```
╔═══════════════════════════════════════════════════════════════╗
║  ▄▄▄  ██  ██ ██████  ██  ██ ███▄   ▄███                      ║
║ ██  ██ ██  ██ ██   ██ ██  ██ ████ ████                        ║
║ ███████ ██  ██ ██████  ██  ██ ██ ███ ██                        ║
║ ██  ██ ██  ██ ██   ██ ██  ██ ██  █  ██                        ║
║ ██  ██  ████  ██   ██  ████  ██     ██  v1.0.0                 ║
╚═══════════════════════════════════════════════════════════════╝

  SMC Strategy Engine  +  Grid Search  +  Bayesian Optimization
  Electron 28 · React 18 · TypeScript · Canvas Charts
```

## Características

- **Motor SMC**: Liquidity Sweeps, CHoCH, Order Blocks, TP1/TP2, compounding
- **Backtest completo**: métricas profesionales (CAGR, Sharpe, Calmar, MaxDD)
- **Grid Search**: 324 combinaciones fijas con Web Worker
- **Bayesian Optimization**: Gaussian Process + EI/UCB/PI desde cero en TypeScript puro
- **Charts Canvas**: Equity Curve, Drawdown, Rentabilidad anual (sin librerías externas)
- **Datos reales**: Twelve Data API con caché local de 24h
- **Modo demo**: datos simulados realistas de XAU/USD 2019–2024

## ASCII Mockup

```
┌─[AURUM v1.0.0]─────────────────────────────────[─][□][✕]─┐
│◈ Dashboard  │  ┌─ CONTROLES ──────────────────────────┐   │
│◎ Backtesting│  │ Symbol: XAU/USD  Interval: 1day      │   │
│⚡ Optimizer BO│  │ Capital: €5000    Risk: ──●── 1%    │   │
│▦ Trades Log │  │ Swing LB: ─●─ 12  OB LB: ─●─ 8      │   │
│◌ Settings   │  │ [▶ RUN BACKTEST]   [⚡ OPTIMIZE]      │   │
│             │  └──────────────────────────────────────┘   │
│[●] 1826 velas│  ┌─ KPIs ───────────────────────────────┐  │
│[●] 847 trades│  │ €12,450  +149%  54.2%WR  1.82PF -12%DD│  │
│             │  └──────────────────────────────────────┘  │
│  AURUM v1.0 │  ┌─[📈 EQUITY]──────────────────────────┐  │
│             │  │         ▁▂▃▅▆▇▇▆▅▇▇▇▇▇▇▇▇▇           │  │
└─────────────┘  │  2019   2020   2021  2022  2023  2024 │  │
                 └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Requisitos

- Node.js 18+
- npm 9+
- (Opcional) API key de [Twelve Data](https://twelvedata.com) para datos reales

## Instalación

```bash
git clone <repo>
cd AURUM
npm install
npm run dev       # Modo desarrollo (Electron + Vite)
npm run dist      # Generar instalable (.exe/.dmg/.AppImage)
```

## Cómo obtener API key de Twelve Data

1. Registrarte en [twelvedata.com](https://twelvedata.com) (gratis)
2. Ir a Dashboard → API Keys
3. Copiar tu key y pegarla en AURUM → Settings
4. El plan gratuito incluye 800 llamadas/día y acceso a datos históricos

## Guía de uso

### Backtesting
1. Selecciona símbolo e intervalo
2. Ajusta los parámetros SMC con los sliders
3. Pulsa **RUN BACKTEST**
4. Navega por Equity, Drawdown, Yearly y Trades

### Grid Search
1. Ve a **Optimizer** → Grid Search
2. Pulsa **INICIAR GRID** — testea 324 combinaciones
3. Haz click en cualquier resultado para aplicarlo y volver al backtest

### Bayesian Optimization
1. Ve a **Optimizer** → Bayesian
2. Configura iteraciones, función de adquisición y factor de exploración
3. Pulsa **INICIAR BAYESIAN** — el algoritmo aprende de cada evaluación
4. Observa la **curva de convergencia** en tiempo real
5. El **scatter plot** muestra dónde está concentrándose la búsqueda
6. Al terminar, pulsa **APLICAR Y BACKTEST**

### Comparativa
Selecciona **Comparar** para ver Grid Search vs Bayesian lado a lado.

## Estrategia SMC Explicada

### Order Block (OB)
Zona de precio donde los Smart Money colocaron grandes órdenes antes de un movimiento
fuerte. Tiende a actuar como soporte/resistencia cuando el precio vuelve a ella.

### Liquidity Sweep
El precio "barre" los stops de los traders retail por encima de un swing high
(bearish sweep) o por debajo de un swing low (bullish sweep), acumulando liquidez
antes de revertir.

### CHoCH (Change of Character)
Después del sweep, el precio rompe la estructura en dirección contraria, confirmando
el cambio de tendencia y la intención institucional.

### Flujo de entrada SMC
```
1. Identificar Swing High/Low (ventana: swingLookback)
2. Detectar Liquidity Sweep (wick + cierre contrario)
3. Confirmar CHoCH (ruptura de estructura)
4. Localizar Order Block (última vela contraria pre-impulso)
5. Entrada al retesteo del OB
6. SL: extremo del OB + slBuffer
7. TP1: 1.5R → cierra 50%
8. TP2: 3R → cierra restante
```

## Interpretación de Métricas

| Métrica | Aceptable | Bueno | Excelente |
|---------|-----------|-------|-----------|
| Win Rate | >45% | >52% | >60% |
| Profit Factor | >1.0 | >1.5 | >2.0 |
| Max Drawdown | <25% | <15% | <10% |
| Sharpe Ratio | >0.5 | >1.0 | >1.5 |
| CAGR | >10% | >25% | >50% |

## Por qué Bayesian en lugar de más Grid Search

Con 6 parámetros y rangos continuos, el espacio real es infinito.
Grid Search solo puede probar valores discretos predefinidos.

Bayesian Optimization trata el espacio como continuo:
- **GP** (Gaussian Process): modela la función objetivo como distribución de probabilidad
- **EI** (Expected Improvement): dirige la búsqueda a zonas con mayor probabilidad de mejora
- Resultado: 60-70 evaluaciones dirigidas superan habitualmente a 324 aleatorias

## Roadmap

- [ ] Conexión IBKR TWS para paper trading en vivo
- [ ] Alertas de señales (Telegram, email)
- [ ] TPE (Tree-structured Parzen Estimator) como alternativa al GP
- [ ] Filtros adicionales: sesiones, ATR, tendencia multi-timeframe
- [ ] Walk-forward optimization para evitar overfitting
- [ ] Export a PDF de resultados

## Disclaimer

⚠️ **AURUM es una herramienta educativa de investigación.**

El rendimiento pasado no garantiza resultados futuros. El trading algorítmico
conlleva riesgos significativos de pérdida de capital. No utilices este software
para tomar decisiones de inversión reales sin comprensión completa de los riesgos.

---

Built with TypeScript puro — sin librerías de ML externas.
Gaussian Process implementado desde cero: kernel RBF, inversión de matriz Gauss-Jordan,
Expected Improvement con CDF/PDF normales (Abramowitz & Stegun).
