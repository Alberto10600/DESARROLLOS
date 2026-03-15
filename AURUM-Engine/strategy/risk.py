"""
Risk Manager — position sizing and portfolio-level risk controls.

Kelly Criterion-based sizing with hard caps.
"""
import logging
from config import MAX_RISK_PCT, MAX_DAILY_LOSS, MAX_OPEN_POSITIONS

logger = logging.getLogger(__name__)


class RiskManager:
    def __init__(self):
        self._daily_pnl: float = 0.0
        self._daily_trades: int = 0
        self._open_positions: int = 0

    def reset_daily(self):
        self._daily_pnl = 0.0
        self._daily_trades = 0

    def record_trade(self, pnl: float):
        self._daily_pnl += pnl
        self._daily_trades += 1

    def open_position(self):
        self._open_positions += 1

    def close_position(self, pnl: float):
        self._open_positions = max(0, self._open_positions - 1)
        self.record_trade(pnl)

    # ── Position Sizing ───────────────────────────────────────────────────────

    def calc_position_size(
        self,
        equity: float,
        entry_price: float,
        sl_price: float,
        risk_pct: float,      # % of equity to risk per trade (from strategy params)
        slippage: float = 0.0,
    ) -> float:
        """
        Calculate position size in units.
        risk_pct is clamped to MAX_RISK_PCT from config.
        """
        effective_risk_pct = min(risk_pct, MAX_RISK_PCT)
        risk_amount = equity * (effective_risk_pct / 100)

        # Adjust entry for slippage
        effective_entry = entry_price + slippage if entry_price > sl_price else entry_price - slippage
        risk_per_unit = abs(effective_entry - sl_price)

        if risk_per_unit <= 0:
            logger.warning("risk_per_unit is zero — position size = 0")
            return 0.0

        size = risk_amount / risk_per_unit
        logger.debug(f"Position size: {size:.4f} units | risk €{risk_amount:.2f} | {effective_risk_pct}%")
        return size

    # ── Pre-trade checks ──────────────────────────────────────────────────────

    def can_trade(self, equity: float) -> tuple[bool, str]:
        """
        Returns (allowed, reason).
        Blocks trading if:
        - Daily loss limit exceeded
        - Max concurrent positions reached
        """
        daily_loss_pct = (self._daily_pnl / equity * 100) if equity > 0 else 0

        if daily_loss_pct <= -MAX_DAILY_LOSS:
            reason = f"Daily loss limit hit ({daily_loss_pct:.1f}% of equity)"
            logger.warning(reason)
            return False, reason

        if self._open_positions >= MAX_OPEN_POSITIONS:
            reason = f"Max positions reached ({self._open_positions}/{MAX_OPEN_POSITIONS})"
            logger.warning(reason)
            return False, reason

        return True, "OK"

    @property
    def daily_pnl(self) -> float:
        return self._daily_pnl

    @property
    def daily_trades(self) -> int:
        return self._daily_trades

    @property
    def open_positions(self) -> int:
        return self._open_positions


# Singleton
risk_manager = RiskManager()
