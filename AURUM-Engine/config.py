"""
AURUM Engine — Configuration
Loaded from environment or .env file.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# API server
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8765"))

# IBKR defaults (overridden per-request from Electron UI)
IBKR_HOST     = os.getenv("IBKR_HOST",      "127.0.0.1")
IBKR_PORT     = int(os.getenv("IBKR_PORT",  "7497"))   # 7497 paper, 7496 live
IBKR_CLIENT   = int(os.getenv("IBKR_CLIENT", "1"))

# Risk limits (hard caps, regardless of UI settings)
MAX_RISK_PCT      = float(os.getenv("MAX_RISK_PCT",      "2.0"))   # max % equity per trade
MAX_DAILY_LOSS    = float(os.getenv("MAX_DAILY_LOSS",    "5.0"))   # max % daily loss before halt
MAX_OPEN_POSITIONS = int(os.getenv("MAX_OPEN_POSITIONS", "3"))     # concurrent positions cap
