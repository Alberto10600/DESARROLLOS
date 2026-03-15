import os
from dotenv import load_dotenv

load_dotenv()

HOST       = os.getenv("HOST", "127.0.0.1")
PORT       = int(os.getenv("PORT", "8765"))
FRONTEND   = os.getenv("FRONTEND_DIR", "../frontend/dist")

# Hard risk caps — never overrideable from the UI
MAX_RISK_PCT_PER_TRADE = float(os.getenv("MAX_RISK_PCT",       "2.0"))
MAX_DAILY_LOSS_PCT     = float(os.getenv("MAX_DAILY_LOSS",     "4.0"))
MAX_OPEN_POSITIONS     = int(os.getenv("MAX_POSITIONS",        "4"))
MAX_PORTFOLIO_HEAT     = float(os.getenv("MAX_PORTFOLIO_HEAT", "6.0"))  # sum of all individual risks

# IBKR defaults (overridden per-session from UI)
IBKR_HOST   = os.getenv("IBKR_HOST",   "127.0.0.1")
IBKR_PORT   = int(os.getenv("IBKR_PORT", "7497"))
IBKR_CLIENT = int(os.getenv("IBKR_CLIENT", "1"))
