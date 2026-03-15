"""IBKR broker — conexión TWS y gestión de órdenes."""
from __future__ import annotations
import asyncio
import logging
from typing import Optional
from ib_insync import IB, Contract, LimitOrder, StopOrder

logger = logging.getLogger(__name__)


class IBKRBroker:
    def __init__(self):
        self.ib      = IB()
        self._account = ""

    @property
    def is_connected(self) -> bool:
        return self.ib.isConnected()

    async def connect(self, host: str, port: int, client_id: int, account: str = "") -> dict:
        try:
            await self.ib.connectAsync(host, port, clientId=client_id, timeout=10)
            self._account = account or self.ib.managedAccounts()[0]
            logger.info(f"IBKR connected: {self._account}")
            return {"status": "connected", "account": self._account}
        except Exception as e:
            logger.error(f"IBKR connect failed: {e}")
            return {"status": "error", "error": str(e)}

    def disconnect(self):
        if self.is_connected:
            self.ib.disconnect()
            logger.info("IBKR disconnected")

    def get_equity(self) -> float:
        if not self.is_connected:
            return 0.0
        for v in self.ib.accountValues(self._account):
            if v.tag == "NetLiquidation" and v.currency in ("EUR", "USD"):
                return float(v.value)
        return 0.0

    def get_positions(self) -> list[dict]:
        if not self.is_connected:
            return []
        return [{
            "symbol":        p.contract.symbol,
            "position":      p.position,
            "avg_cost":      p.avgCost,
            "unrealized_pnl": getattr(p, "unrealizedPNL", 0.0),
        } for p in self.ib.positions(self._account)]

    def submit_bracket(
        self,
        symbol: str, sec_type: str, currency: str, exchange: str,
        direction: str, quantity: float,
        entry: float, sl: float, tp: float,
    ) -> Optional[dict]:
        if not self.is_connected:
            return None
        action  = "BUY"  if direction == "LONG"  else "SELL"
        reverse = "SELL" if direction == "LONG"  else "BUY"

        c = Contract()
        c.symbol   = symbol
        c.secType  = sec_type
        c.currency = currency
        c.exchange  = exchange

        oca = f"AURUM_{symbol}_{entry:.4f}"

        entry_o = LimitOrder(action,  quantity, entry); entry_o.tif = "GTC"
        tp_o    = LimitOrder(reverse, quantity, tp);    tp_o.tif    = "GTC"; tp_o.ocaGroup = oca
        sl_o    = StopOrder(reverse,  quantity, sl);    sl_o.tif    = "GTC"; sl_o.ocaGroup = oca

        try:
            et = self.ib.placeOrder(c, entry_o)
            tt = self.ib.placeOrder(c, tp_o)
            st = self.ib.placeOrder(c, sl_o)
            return {"entry_id": et.order.orderId, "tp_id": tt.order.orderId, "sl_id": st.order.orderId}
        except Exception as e:
            logger.error(f"Bracket order failed: {e}")
            return None


broker = IBKRBroker()
