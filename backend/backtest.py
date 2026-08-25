"""Backtest engine. Runs a simple, rule-based simulation over generated OHLCV
using ATR-based SL/TP and EMA/RSI entries. Produces full statistics including
expectancy, profit factor, drawdown, Sharpe/Sortino, MFE/MAE.

Includes an anti-overfit guard: the same rules are evaluated on in-sample and
out-of-sample slices; if performance collapses out-of-sample the strategy is
flagged REJECTED.
"""
import numpy as np
from market_data import generate_ohlcv, _ema, _rsi, _atr, _adx


def _run_rules(df, direction_bias, min_rr):
    close = df["close"].values
    high = df["high"].values
    low = df["low"].values
    ema20 = _ema(df["close"], 20).values
    ema50 = _ema(df["close"], 50).values
    rsi = _rsi(df["close"]).values
    atr = _atr(df).values
    adx = _adx(df).values

    trades = []
    i = 55
    n = len(df)
    while i < n - 1:
        if np.isnan(atr[i]) or atr[i] <= 0:
            i += 1
            continue
        long_sig = ema20[i] > ema50[i] and rsi[i] > 52 and adx[i] > 20
        short_sig = ema20[i] < ema50[i] and rsi[i] < 48 and adx[i] > 20
        entry = close[i]
        if long_sig and direction_bias in ("BOTH", "LONG"):
            sl = entry - atr[i] * 1.2
            tp = entry + atr[i] * 1.2 * min_rr
            trades.append(_simulate_trade(high, low, i + 1, n, entry, sl, tp, "BUY", atr[i]))
            i += 6
            continue
        if short_sig and direction_bias in ("BOTH", "SHORT"):
            sl = entry + atr[i] * 1.2
            tp = entry - atr[i] * 1.2 * min_rr
            trades.append(_simulate_trade(high, low, i + 1, n, entry, sl, tp, "SELL", atr[i]))
            i += 6
            continue
        i += 1
    return [t for t in trades if t]


def _simulate_trade(high, low, start, n, entry, sl, tp, direction, atr):
    mfe = mae = 0.0
    for j in range(start, min(start + 40, n)):
        if direction == "BUY":
            mfe = max(mfe, high[j] - entry)
            mae = min(mae, low[j] - entry)
            if low[j] <= sl:
                return {"r": -1.0, "win": False, "mfe": mfe / atr, "mae": mae / atr}
            if high[j] >= tp:
                return {"r": (tp - entry) / (entry - sl), "win": True, "mfe": mfe / atr, "mae": mae / atr}
        else:
            mfe = max(mfe, entry - low[j])
            mae = min(mae, entry - high[j])
            if high[j] >= sl:
                return {"r": -1.0, "win": False, "mfe": mfe / atr, "mae": mae / atr}
            if low[j] <= tp:
                return {"r": (entry - tp) / (sl - entry), "win": True, "mfe": mfe / atr, "mae": mae / atr}
    return None


def _stats(trades):
    if not trades:
        return {"total_trades": 0}
    rs = np.array([t["r"] for t in trades])
    wins = rs[rs > 0]
    losses = rs[rs <= 0]
    win_rate = round(len(wins) / len(rs) * 100, 2)
    avg_win = round(float(wins.mean()), 3) if len(wins) else 0
    avg_loss = round(float(losses.mean()), 3) if len(losses) else 0
    gross_profit = float(wins.sum())
    gross_loss = abs(float(losses.sum()))
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else round(gross_profit, 2)
    expectancy = round((win_rate / 100) * avg_win + (1 - win_rate / 100) * avg_loss, 3)
    equity = np.cumsum(rs)
    peak = np.maximum.accumulate(equity)
    dd = peak - equity
    max_dd = round(float(dd.max()), 2) if len(dd) else 0
    sharpe = round(float(rs.mean() / rs.std() * np.sqrt(len(rs))), 2) if rs.std() > 0 else 0
    downside = rs[rs < 0]
    sortino = round(float(rs.mean() / downside.std() * np.sqrt(len(rs))), 2) if len(downside) and downside.std() > 0 else 0
    # consecutive
    max_cw = max_cl = cw = cl = 0
    for r in rs:
        if r > 0:
            cw += 1; cl = 0; max_cw = max(max_cw, cw)
        else:
            cl += 1; cw = 0; max_cl = max(max_cl, cl)
    return {
        "total_trades": len(rs),
        "wins": int(len(wins)),
        "losses": int(len(losses)),
        "win_rate": win_rate,
        "loss_rate": round(100 - win_rate, 2),
        "profit_factor": profit_factor,
        "net_profit_r": round(float(rs.sum()), 2),
        "avg_r": round(float(rs.mean()), 3),
        "expectancy": expectancy,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
        "largest_win": round(float(rs.max()), 2),
        "largest_loss": round(float(rs.min()), 2),
        "max_consecutive_wins": max_cw,
        "max_consecutive_losses": max_cl,
        "max_drawdown_r": max_dd,
        "sharpe": sharpe,
        "sortino": sortino,
        "avg_mfe": round(float(np.mean([t["mfe"] for t in trades])), 2),
        "avg_mae": round(float(np.mean([t["mae"] for t in trades])), 2),
        "equity_curve": [round(float(x), 3) for x in equity.tolist()],
    }


def run_backtest(symbol, timeframe, min_rr=2.0, direction_bias="BOTH", bars=1500):
    df = generate_ohlcv(symbol, timeframe, bars=bars, salt="bt")
    split = int(len(df) * 0.6)
    in_sample = df.iloc[:split]
    out_sample = df.iloc[split:]

    all_trades = _run_rules(df, direction_bias, min_rr)
    is_trades = _run_rules(in_sample, direction_bias, min_rr)
    oos_trades = _run_rules(out_sample.reset_index(drop=True), direction_bias, min_rr)

    full = _stats(all_trades)
    is_stats = _stats(is_trades)
    oos_stats = _stats(oos_trades)

    # anti-overfit: OOS expectancy must remain positive and not collapse
    overfit_flag = False
    reasons = []
    if oos_stats.get("total_trades", 0) < 10:
        overfit_flag = True
        reasons.append("Too few out-of-sample trades")
    if oos_stats.get("expectancy", -1) <= 0:
        overfit_flag = True
        reasons.append("Out-of-sample expectancy not positive")
    if is_stats.get("expectancy", 0) > 0 and oos_stats.get("expectancy", 0) < is_stats.get("expectancy", 0) * 0.3:
        overfit_flag = True
        reasons.append("Out-of-sample performance collapsed vs in-sample (overfit)")

    status = "REJECTED" if overfit_flag else ("APPROVED" if full.get("expectancy", 0) > 0 and full.get("profit_factor", 0) > 1.1 else "VALIDATING")

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "min_rr": min_rr,
        "full": full,
        "in_sample": {k: is_stats.get(k) for k in ("total_trades", "win_rate", "profit_factor", "expectancy", "avg_r")},
        "out_of_sample": {k: oos_stats.get(k) for k in ("total_trades", "win_rate", "profit_factor", "expectancy", "avg_r")},
        "overfit_flag": overfit_flag,
        "overfit_reasons": reasons,
        "status": status,
    }
