"""
IBKR broker wrapper using ib_insync.
Handles connection lifecycle, order submission, and position tracking.
"""
import asyncio
import logging
from typing import Optional
from ib_insync import IB, Contract, Order, MarketOrder, LimitOrder, StopOrder

logger = logging.getLogger(__name__)


class IBKRBroker:
    def __init__(self):
        self.ib = IB()
        self._connected = False
        self._account: str = ""

    # ── Connection ────────────────────────────────────────────────────────────

    async def connect(
        self,
        host: str = "127.0.0.1",
        port: int = 7497,
        client_id: int = 1,
        account: str = "",
    ) -> dict:
        """Connect to IB TWS/Gateway. Returns status dict."""
        try:
            await self.ib.connectAsync(host, port, clientId=client_id, timeout=10)
            self._connected = True
            self._account = account or self.ib.managedAccounts()[0]
            logger.info(f"Connected to IBKR: {self._account} @ {host}:{port}")
            return {"status": "connected", "account": self._account}
        except Exception as e:
            self._connected = False
            logger.error(f"IBKR connection failed: {e}")
            return {"status": "error", "error": str(e)}

    def disconnect(self):
        """Disconnect from TWS."""
        if self._connected:
            self.ib.disconnect()
            self._connected = False
            logger.info("Disconnected from IBKR")

    @property
    def is_connected(self) -> bool:
        return self._connected and self.ib.isConnected()

    # ── Account & Positions ───────────────────────────────────────────────────

    def get_account_value(self) -> float:
        """Net liquidation value in base currency."""
        if not self.is_connected:
            return 0.0
        vals = self.ib.accountValues(self._account)
        for v in vals:
            if v.tag == "NetLiquidation" and v.currency == "EUR":
                return float(v.value)
        return 0.0

    def get_positions(self) -> list[dict]:
        """Current open positions."""
        if not self.is_connected:
            return []
        positions = []
        for pos in self.ib.positions(self._account):
            contract = pos.contract
            positions.append({
                "symbol":       contract.symbol,
                "secType":      contract.secType,
                "currency":     contract.currency,
                "position":     pos.position,
                "avgCost":      pos.avgCost,
                "marketValue":  pos.marketValue if hasattr(pos, "marketValue") else 0.0,
                "unrealizedPnl": pos.unrealizedPNL if hasattr(pos, "unrealizedPNL") else 0.0,
            })
        return positions

    def get_daily_pnl(self) -> float:
        """Today's realized + unrealized P&L."""
        if not self.is_connected:
            return 0.0
        try:
            pnl = self.ib.pnl(self._account)
            return float(pnl.dailyPnL) if pnl else 0.0
        except Exception:
            return 0.0

    # ── Order Submission ──────────────────────────────────────────────────────

    def _make_contract(self, symbol: str, sec_type: str = "CFD", currency: str = "USD", exchange: str = "SMART") -> Contract:
        """Build an IB Contract object."""
        c = Contract()
        c.symbol   = symbol
        c.secType  = sec_type
        c.currency = currency
        c.exchange = exchange
        return c

    def submit_bracket_order(
        self,
        symbol: str,
        direction: str,        # 'LONG' | 'SHORT'
        quantity: float,
        entry_price: float,    # limit entry
        sl_price: float,
        tp1_price: float,
        tp2_price: float,
        sec_type: str = "CFD",
        currency: str = "USD",
    ) -> Optional[dict]:
        """
        Submit a bracket order: limit entry + OCA (SL + TP1 + TP2).
        Returns order IDs or None on failure.
        """
        if not self.is_connected:
            logger.error("Not connected to IBKR")
            return None

        action = "BUY" if direction == "LONG" else "SELL"
        close_action = "SELL" if direction == "LONG" else "BUY"

        contract = self._make_contract(symbol, sec_type, currency)
        qty_half = round(quantity / 2, 2)

        try:
            # Entry: limit order
            entry_order = LimitOrder(action, quantity, entry_price)
            entry_order.tif = "GTC"
            entry_order.account = self._account

            # OCA group name
            oca_group = f"AURUM_{symbol}_{entry_price}"

            # TP1: close half at tp1_price
            tp1_order = LimitOrder(close_action, qty_half, tp1_price)
            tp1_order.tif = "GTC"
            tp1_order.ocaGroup = oca_group
            tp1_order.account = self._account

            # TP2: close other half at tp2_price
            tp2_order = LimitOrder(close_action, qty_half, tp2_price)
            tp2_order.tif = "GTC"
            tp2_order.ocaGroup = oca_group
            tp2_order.account = self._account

            # SL: stop order for full size
            sl_order = StopOrder(close_action, quantity, sl_price)
            sl_order.tif = "GTC"
            sl_order.ocaGroup = oca_group
            sl_order.account = self._account

            # Submit
            e_trade  = self.ib.placeOrder(contract, entry_order)
            tp1_trade = self.ib.placeOrder(contract, tp1_order)
            tp2_trade = self.ib.placeOrder(contract, tp2_order)
            sl_trade  = self.ib.placeOrder(contract, sl_order)

            logger.info(f"Bracket order submitted: {direction} {quantity} {symbol} @ {entry_price}")
            return {
                "entry_id": e_trade.order.orderId,
                "tp1_id":   tp1_trade.order.orderId,
                "tp2_id":   tp2_trade.order.orderId,
                "sl_id":    sl_trade.order.orderId,
            }
        except Exception as e:
            logger.error(f"Order submission failed: {e}")
            return None

    def cancel_all_orders(self, symbol: Optional[str] = None):
        """Cancel all open orders, optionally filtered by symbol."""
        if not self.is_connected:
            return
        trades = self.ib.trades()
        for trade in trades:
            if symbol and trade.contract.symbol != symbol:
                continue
            if trade.orderStatus.status in ("Submitted", "PreSubmitted"):
                self.ib.cancelOrder(trade.order)
                logger.info(f"Cancelled order {trade.order.orderId}")


# Singleton instance
broker = IBKRBroker()
