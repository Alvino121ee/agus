"""Market data normalizer.

Produces a normalized market snapshot (OHLCV + indicators) that feeds the
agents. Data can come from two sources:
  1. Real bars pushed by the MT5 EA via /api/mt5/market_data (preferred).
  2. A deterministic synthetic generator (seeded by symbol+timeframe+regime)
     used when no live EA feed is present.

Indicators are computed with numpy/pandas — these are real calculations, not
mocked values.
"""
import hashlib
import numpy as np
import pandas as pd

SYMBOL_BASE = {
    "XAUUSD": 2350.0,
    "EURUSD": 1.0850,
    "GBPUSD": 1.2700,
    "USDJPY": 157.50,
    "BTCUSD": 64000.0,
    "US30": 39000.0,
    "NAS100": 18500.0,
}

TIMEFRAME_MINUTES = {"M1": 1, "M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 240, "D1": 1440}


def _seed(symbol: str, timeframe: str, salt: str = "") -> int:
    h = hashlib.sha256(f"{symbol}{timeframe}{salt}".encode()).hexdigest()
    return int(h[:8], 16)


def generate_ohlcv(symbol: str, timeframe: str, bars: int = 400, salt: str = "") -> pd.DataFrame:
    base = SYMBOL_BASE.get(symbol.upper(), 100.0)
    vol_pct = 0.004 if symbol.upper() in ("XAUUSD", "BTCUSD", "US30", "NAS100") else 0.0012
    rng = np.random.default_rng(_seed(symbol, timeframe, salt))

    # regime-driven drift: alternating trend / range blocks
    drift = np.zeros(bars)
    i = 0
    while i < bars:
        block = int(rng.integers(20, 60))
        mode = rng.integers(0, 3)  # 0 up-trend, 1 down-trend, 2 range
        if mode == 0:
            drift[i : i + block] = rng.uniform(0.0002, 0.0009)
        elif mode == 1:
            drift[i : i + block] = -rng.uniform(0.0002, 0.0009)
        else:
            drift[i : i + block] = 0.0
        i += block

    returns = rng.normal(0, vol_pct, bars) + drift[:bars]
    close = base * np.cumprod(1 + returns)
    high = close * (1 + np.abs(rng.normal(0, vol_pct * 0.6, bars)))
    low = close * (1 - np.abs(rng.normal(0, vol_pct * 0.6, bars)))
    open_ = np.concatenate([[base], close[:-1]])
    high = np.maximum.reduce([high, open_, close])
    low = np.minimum.reduce([low, open_, close])
    volume = rng.integers(500, 5000, bars).astype(float)

    idx = pd.date_range(end=pd.Timestamp.utcnow(), periods=bars, freq=f"{TIMEFRAME_MINUTES.get(timeframe, 15)}min")
    return pd.DataFrame({"open": open_, "high": high, "low": low, "close": close, "volume": volume}, index=idx)


def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def _rsi(s: pd.Series, n: int = 14) -> pd.Series:
    delta = s.diff()
    up = delta.clip(lower=0).rolling(n).mean()
    down = -delta.clip(upper=0).rolling(n).mean()
    rs = up / down.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50)


def _atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    hl = df["high"] - df["low"]
    hc = (df["high"] - df["close"].shift()).abs()
    lc = (df["low"] - df["close"].shift()).abs()
    tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
    return tr.rolling(n).mean()


def _adx(df: pd.DataFrame, n: int = 14) -> pd.Series:
    up = df["high"].diff()
    down = -df["low"].diff()
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    atr = _atr(df, n)
    plus_di = 100 * pd.Series(plus_dm, index=df.index).rolling(n).mean() / atr
    minus_di = 100 * pd.Series(minus_dm, index=df.index).rolling(n).mean() / atr
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return dx.rolling(n).mean().fillna(15)


def build_snapshot(symbol: str, timeframe: str, df: pd.DataFrame = None, salt: str = "") -> dict:
    if df is None:
        df = generate_ohlcv(symbol, timeframe, salt=salt)
    close = df["close"]
    ema20 = _ema(close, 20)
    ema50 = _ema(close, 50)
    ema200 = _ema(close, 200)
    rsi = _rsi(close)
    atr = _atr(df)
    adx = _adx(df)
    macd = _ema(close, 12) - _ema(close, 26)
    macd_signal = _ema(macd, 9)
    bb_mid = close.rolling(20).mean()
    bb_std = close.rolling(20).std()

    last = -1
    price = float(close.iloc[last])
    recent = df.iloc[-40:]
    swing_high = float(recent["high"].max())
    swing_low = float(recent["low"].min())
    atr_v = float(atr.iloc[last])
    adx_v = float(adx.iloc[last])
    bbw = float(((bb_std.iloc[last] * 4) / bb_mid.iloc[last]) * 100) if bb_mid.iloc[last] else 0

    ema_stack_bull = ema20.iloc[last] > ema50.iloc[last] > ema200.iloc[last]
    ema_stack_bear = ema20.iloc[last] < ema50.iloc[last] < ema200.iloc[last]

    # session (UTC hour heuristic)
    hour = df.index[-1].hour
    if 0 <= hour < 7:
        session = "ASIA"
    elif 7 <= hour < 12:
        session = "LONDON"
    elif 12 <= hour < 16:
        session = "LONDON_NY_OVERLAP"
    elif 16 <= hour < 21:
        session = "NEWYORK"
    else:
        session = "AFTER_HOURS"

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "price": round(price, 5),
        "session": session,
        "indicators": {
            "ema20": round(float(ema20.iloc[last]), 5),
            "ema50": round(float(ema50.iloc[last]), 5),
            "ema200": round(float(ema200.iloc[last]), 5),
            "rsi": round(float(rsi.iloc[last]), 2),
            "atr": round(atr_v, 5),
            "adx": round(adx_v, 2),
            "macd": round(float(macd.iloc[last]), 5),
            "macd_signal": round(float(macd_signal.iloc[last]), 5),
            "bb_width_pct": round(bbw, 3),
            "ema_stack_bull": bool(ema_stack_bull),
            "ema_stack_bear": bool(ema_stack_bear),
        },
        "structure": {
            "swing_high": round(swing_high, 5),
            "swing_low": round(swing_low, 5),
            "range_pct": round((swing_high - swing_low) / price * 100, 3),
            "dist_to_high_atr": round((swing_high - price) / atr_v, 2) if atr_v else 0,
            "dist_to_low_atr": round((price - swing_low) / atr_v, 2) if atr_v else 0,
        },
        "ohlcv_tail": [
            {
                "t": str(idx),
                "o": round(float(r.open), 5),
                "h": round(float(r.high), 5),
                "l": round(float(r.low), 5),
                "c": round(float(r.close), 5),
                "v": float(r.volume),
            }
            for idx, r in df.iloc[-30:].iterrows()
        ],
    }
