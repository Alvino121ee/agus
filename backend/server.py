import os
import logging
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, APIRouter, HTTPException, Header, Body
from fastapi.responses import PlainTextResponse
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import db, now_iso
import deepseek_client as ds
import orchestrator
import backtest as bt
import agents
import risk_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("server")

app = FastAPI(title="AI Trading Automation Multi-Agent")
api = APIRouter(prefix="/api")

MT5_SECRET = os.environ.get("MT5_API_SECRET", "")
ROOT_DIR = Path(__file__).parent

DISCLAIMER = "AI does not guarantee profit. Backtest is not a guarantee of future results. Test on PAPER/DEMO before LIVE."


# ---------------- Settings helpers ----------------
async def get_settings() -> dict:
    doc = await db.settings.find_one({"key": "app"}, {"_id": 0})
    if not doc:
        doc = {
            "key": "app",
            "mode": "PAPER",
            "emergency_stop": False,
            "risk": dict(risk_engine.DEFAULT_RISK),
            "news_filter": {"policy": "ALLOW_TRADING", "enabled": False},
            "account": {"balance": 10000.0, "equity": 10000.0, "daily_loss_pct": 0.0, "weekly_loss_pct": 0.0, "drawdown_pct": 0.0, "consecutive_losses": 0, "exposure_pct": 0.0},
            "created_at": now_iso(),
        }
        await db.settings.insert_one(dict(doc))
        doc.pop("_id", None)
    # ensure all risk keys present
    for k, v in risk_engine.DEFAULT_RISK.items():
        doc["risk"].setdefault(k, v)
    return doc


async def account_state() -> dict:
    s = await get_settings()
    open_positions = await db.positions.count_documents({"status": "OPEN"})
    acc = dict(s["account"])
    acc["open_positions"] = open_positions
    acc["emergency_stop"] = s["emergency_stop"]
    return acc


# ---------------- Models ----------------
class AnalysisReq(BaseModel):
    symbol: str = "XAUUSD"
    timeframe: str = "M15"


class BacktestReq(BaseModel):
    symbol: str = "XAUUSD"
    timeframe: str = "M15"
    min_rr: float = 2.0
    direction_bias: str = "BOTH"


class StrategyReq(BaseModel):
    symbol: str = "XAUUSD"
    timeframe: str = "M15"
    regime: Optional[str] = None
    min_rr: float = 2.0


class SettingsUpdate(BaseModel):
    mode: Optional[str] = None
    emergency_stop: Optional[bool] = None
    risk: Optional[dict] = None
    news_filter: Optional[dict] = None
    account: Optional[dict] = None


# ---------------- Health / status ----------------
@api.get("/")
async def root():
    return {"message": "AI Trading Automation Multi-Agent API", "disclaimer": DISCLAIMER}


@api.get("/status/deepseek")
async def deepseek_status():
    return ds.status()


# ---------------- Settings ----------------
@api.get("/settings")
async def settings_get():
    return await get_settings()


@api.put("/settings")
async def settings_put(body: SettingsUpdate):
    s = await get_settings()
    update = {}
    if body.mode is not None:
        if body.mode not in ("PAPER", "DEMO", "LIVE"):
            raise HTTPException(400, "mode must be PAPER|DEMO|LIVE")
        update["mode"] = body.mode
    if body.emergency_stop is not None:
        update["emergency_stop"] = body.emergency_stop
    if body.risk is not None:
        merged = dict(s["risk"]); merged.update(body.risk); update["risk"] = merged
    if body.news_filter is not None:
        merged = dict(s["news_filter"]); merged.update(body.news_filter); update["news_filter"] = merged
    if body.account is not None:
        merged = dict(s["account"]); merged.update(body.account); update["account"] = merged
    await db.settings.update_one({"key": "app"}, {"$set": update})
    await db.audit_logs.insert_one({"type": "SETTINGS_UPDATE", "changes": list(update.keys()), "created_at": now_iso()})
    return await get_settings()


# ---------------- Analysis pipeline ----------------
@api.post("/analysis/run")
async def analysis_run(body: AnalysisReq):
    s = await get_settings()
    if s["emergency_stop"]:
        raise HTTPException(423, "Emergency Stop active — signal generation halted")
    acc = await account_state()
    run = await orchestrator.run_pipeline(db, body.symbol, body.timeframe, s["risk"], s["mode"], acc)
    return run


@api.get("/analysis/runs")
async def analysis_runs(limit: int = 25):
    runs = await db.agent_runs.find({}, {"_id": 0, "snapshot": 0}).sort("created_at", -1).to_list(limit)
    return runs


@api.get("/analysis/runs/{run_id}")
async def analysis_run_detail(run_id: str):
    run = await db.agent_runs.find_one({"run_id": run_id}, {"_id": 0})
    if not run:
        raise HTTPException(404, "run not found")
    return run


@api.get("/agents")
async def agents_list():
    latest = await db.agent_runs.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
    meta = []
    latest_map = {a["agent_id"]: a for a in latest["agents"]} if latest else {}
    for key in agents.AGENT_ORDER:
        m = agents.AGENT_META[key]
        la = latest_map.get(key)
        meta.append({
            "agent_id": key,
            "name": m["name"],
            "role": m["role"],
            "version": m["version"],
            "status": "Online",
            "last_score": la["score"] if la else None,
            "last_decision": la["decision"] if la else None,
            "last_reason": la["reason"] if la else None,
            "execution_time_ms": la["execution_time_ms"] if la else None,
            "source": la["source"] if la else None,
        })
    return {"agents": meta, "last_run_id": latest["run_id"] if latest else None, "deepseek": ds.status()}


# ---------------- Signals ----------------
@api.get("/signals")
async def signals_list(limit: int = 50):
    return await db.signals.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)


@api.get("/chart/{symbol}")
async def chart(symbol: str, timeframe: str = "M15", bars: int = 220):
    import market_data
    df = market_data.generate_ohlcv(symbol, timeframe, bars=bars)
    out = []
    for idx, r in df.iterrows():
        out.append({
            "time": int(idx.timestamp()),
            "open": round(float(r.open), 5), "high": round(float(r.high), 5),
            "low": round(float(r.low), 5), "close": round(float(r.close), 5),
        })
    sigs = await db.signals.find({"symbol": symbol.upper()}, {"_id": 0}).sort("created_at", -1).to_list(15)
    times = [b["time"] for b in out]
    markers = []
    for i, s in enumerate(sigs):
        t = times[max(0, len(times) - 1 - i * 5)] if times else 0
        markers.append({
            "signal_id": s["signal_id"], "time": t, "direction": s["direction"],
            "entry": s["entry"], "stop_loss": s["stop_loss"], "take_profit": s["take_profit"],
            "confidence": s["confidence"], "risk_reward": s["risk_reward"], "status": s["status"],
            "created_at": s.get("created_at"),
        })
    return {"symbol": symbol.upper(), "timeframe": timeframe, "bars": out, "signals": markers, "last_price": out[-1]["close"] if out else None}


@api.get("/signals/{signal_id}")
async def signal_detail(signal_id: str):
    sig = await db.signals.find_one({"signal_id": signal_id}, {"_id": 0})
    if not sig:
        raise HTTPException(404, "signal not found")
    return sig


# ---------------- Strategy Lab ----------------
@api.post("/strategies/create")
async def strategy_create(body: StrategyReq):
    import market_data
    snap = market_data.build_snapshot(body.symbol, body.timeframe)
    ctx = {"min_rr": body.min_rr}
    for key in ["market_scanner", "structure_analyst", "technical_analyst", "price_action", "market_regime", "strategy_builder", "rr_optimizer"]:
        ctx[key] = await agents.run_agent(key, snap, ctx)
    chosen = ctx["strategy_builder"]["output"].get("chosen")
    regime = ctx["market_regime"]["output"]["regime"]
    result = bt.run_backtest(body.symbol, body.timeframe, body.min_rr)
    seq = await db.strategies.count_documents({}) + 1
    name = chosen["name"] if chosen else "Adaptive Setup"
    doc = {
        "strategy_id": f"STRAT-{seq:03d}",
        "name": name,
        "description": f"AI-built {name} for {body.symbol} {body.timeframe} in {regime} regime.",
        "market_regime": regime,
        "symbols": [body.symbol.upper()],
        "timeframes": [body.timeframe],
        "entry_rules": chosen["entry_logic"] if chosen else "Confirmation-based entry",
        "exit_rules": "Exit on TP/SL or structural invalidation",
        "sl_rules": chosen["sl_logic"] if chosen else "Below/above structural invalidation",
        "tp_rules": chosen["tp_logic"] if chosen else "Next liquidity target",
        "risk_rules": f"Risk per trade capped by Risk Engine. Min RR {body.min_rr}.",
        "min_rr": body.min_rr,
        "max_rr": 5.0,
        "backtest": result["full"],
        "in_sample": result["in_sample"],
        "out_of_sample": result["out_of_sample"],
        "overfit_flag": result["overfit_flag"],
        "overfit_reasons": result["overfit_reasons"],
        "drawdown": result["full"].get("max_drawdown_r"),
        "version": 1,
        "status": result["status"],
        "created_at": now_iso(),
    }
    await db.strategies.insert_one(dict(doc))
    doc.pop("_id", None)
    await db.audit_logs.insert_one({"type": "STRATEGY_CREATED", "strategy_id": doc["strategy_id"], "status": doc["status"], "created_at": now_iso()})
    return doc


@api.get("/strategies")
async def strategies_list():
    return await db.strategies.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api.get("/strategies/{strategy_id}")
async def strategy_detail(strategy_id: str):
    doc = await db.strategies.find_one({"strategy_id": strategy_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "strategy not found")
    return doc


@api.put("/strategies/{strategy_id}/status")
async def strategy_status(strategy_id: str, status: str = Body(..., embed=True)):
    valid = ["DRAFT", "BACKTESTING", "VALIDATING", "APPROVED", "LIVE", "PAUSED", "REJECTED"]
    if status not in valid:
        raise HTTPException(400, f"status must be one of {valid}")
    r = await db.strategies.update_one({"strategy_id": strategy_id}, {"$set": {"status": status}})
    if r.matched_count == 0:
        raise HTTPException(404, "strategy not found")
    await db.audit_logs.insert_one({"type": "STRATEGY_STATUS", "strategy_id": strategy_id, "status": status, "created_at": now_iso()})
    return {"strategy_id": strategy_id, "status": status}


# ---------------- Backtest ----------------
@api.post("/backtest/run")
async def backtest_run(body: BacktestReq):
    result = bt.run_backtest(body.symbol, body.timeframe, body.min_rr, body.direction_bias)
    doc = {**result, "created_at": now_iso()}
    await db.backtests.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.get("/backtests")
async def backtests_list(limit: int = 25):
    return await db.backtests.find({}, {"_id": 0, "full.equity_curve": 0}).sort("created_at", -1).to_list(limit)


# ---------------- Positions & Trades ----------------
@api.get("/positions")
async def positions_list():
    return await db.positions.find({}, {"_id": 0}).sort("opened_at", -1).to_list(100)


@api.get("/trades")
async def trades_list(limit: int = 100):
    return await db.trades.find({}, {"_id": 0}).sort("closed_at", -1).to_list(limit)


@api.post("/trades/{trade_id}/postmortem")
async def trade_postmortem(trade_id: str):
    trade = await db.trades.find_one({"trade_id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(404, "trade not found")
    won = trade.get("result_r", 0) > 0
    pm = {
        "trade_id": trade_id,
        "entry_quality": "Good" if won else "Questionable — review confirmation",
        "sl_assessment": "Appropriate" if won else "SL may have been too tight vs volatility",
        "tp_assessment": "Realistic target" if won else "Target possibly too far for regime",
        "market_change": "Regime stable" if won else "Market conditions shifted after entry",
        "signal_valid": True,
        "execution_timing": "On time",
        "spread_impact": "Minimal",
        "improvement": "Maintain rules" if won else "Consider stricter confluence + regime filter",
        "note": DISCLAIMER,
        "created_at": now_iso(),
    }
    await db.trade_postmortems.insert_one(dict(pm))
    pm.pop("_id", None)
    await db.trades.update_one({"trade_id": trade_id}, {"$set": {"postmortem": True}})
    return pm


@api.get("/trades/{trade_id}/postmortem")
async def get_postmortem(trade_id: str):
    pm = await db.trade_postmortems.find_one({"trade_id": trade_id}, {"_id": 0})
    if not pm:
        raise HTTPException(404, "no postmortem")
    return pm


# ---------------- Performance ----------------
@api.get("/performance")
async def performance():
    trades = await db.trades.find({}, {"_id": 0}).to_list(1000)
    total = len(trades)
    signals = await db.signals.count_documents({})
    runs = await db.agent_runs.count_documents({})
    no_trades = await db.agent_runs.count_documents({"final_decision": "NO_TRADE"})
    if total == 0:
        return {"total_trades": 0, "signals": signals, "runs": runs, "no_trade_runs": no_trades, "no_trade_rate": round(no_trades / runs * 100, 1) if runs else 0}
    rs = [t.get("result_r", 0) for t in trades]
    wins = [r for r in rs if r > 0]
    equity, cum = [], 0
    for r in rs:
        cum += r; equity.append(round(cum, 3))
    return {
        "total_trades": total,
        "signals": signals,
        "runs": runs,
        "no_trade_runs": no_trades,
        "no_trade_rate": round(no_trades / runs * 100, 1) if runs else 0,
        "win_rate": round(len(wins) / total * 100, 1),
        "net_r": round(sum(rs), 2),
        "avg_r": round(sum(rs) / total, 3),
        "equity_curve": equity,
    }


# ---------------- Logs ----------------
@api.get("/logs")
async def logs(limit: int = 100):
    audit = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    execu = await db.execution_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    risk = await db.risk_events.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"audit": audit, "execution": execu, "risk": risk}


# ---------------- Controls ----------------
@api.post("/controls/emergency-stop")
async def emergency_stop(active: bool = Body(..., embed=True)):
    await db.settings.update_one({"key": "app"}, {"$set": {"emergency_stop": active}}, upsert=True)
    await db.audit_logs.insert_one({"type": "EMERGENCY_STOP", "active": active, "created_at": now_iso()})
    await db.risk_events.insert_one({"type": "EMERGENCY_STOP", "detail": f"Emergency stop {'ACTIVATED' if active else 'CLEARED'}", "created_at": now_iso()})
    return {"emergency_stop": active}


@api.post("/controls/close-all")
async def close_all(confirm: bool = Body(False, embed=True)):
    if not confirm:
        raise HTTPException(400, "Second confirmation required (confirm=true)")
    positions = await db.positions.find({"status": "OPEN"}, {"_id": 0}).to_list(1000)
    for p in positions:
        await db.positions.update_one({"position_id": p["position_id"]}, {"$set": {"status": "CLOSED", "closed_at": now_iso()}})
        await db.trades.insert_one({
            "trade_id": p["position_id"], "signal_id": p.get("signal_id"), "symbol": p["symbol"],
            "direction": p["direction"], "entry": p["entry"], "exit": p["entry"], "result_r": 0.0,
            "outcome": "MANUAL_CLOSE", "closed_at": now_iso(),
        })
    await db.audit_logs.insert_one({"type": "CLOSE_ALL", "count": len(positions), "created_at": now_iso()})
    return {"closed": len(positions)}


# ---------------- MT5 EA integration ----------------
def _check_ea(token: Optional[str]):
    if not token or token != MT5_SECRET:
        raise HTTPException(401, "Invalid EA token")


@api.get("/mt5/status")
async def mt5_status():
    conn = await db.ea_connections.find_one({}, {"_id": 0}, sort=[("last_heartbeat", -1)])
    s = await get_settings()
    return {"connection": conn, "mode": s["mode"], "emergency_stop": s["emergency_stop"], "secret_configured": bool(MT5_SECRET)}


@api.get("/mt5/ea-file", response_class=PlainTextResponse)
async def mt5_ea_file():
    path = ROOT_DIR / "ea" / "AITradingBridge.mq5"
    return path.read_text()


@api.post("/mt5/heartbeat")
async def mt5_heartbeat(payload: dict = Body(...), x_ea_token: Optional[str] = Header(None)):
    _check_ea(x_ea_token)
    doc = {
        "connection_id": payload.get("connection_id", "MT5-EA"),
        "balance": payload.get("balance"), "equity": payload.get("equity"),
        "margin": payload.get("margin"), "open_positions": payload.get("open_positions", 0),
        "last_heartbeat": now_iso(), "status": "ONLINE",
    }
    await db.ea_connections.update_one({"connection_id": doc["connection_id"]}, {"$set": doc}, upsert=True)
    if payload.get("balance") is not None:
        await db.settings.update_one({"key": "app"}, {"$set": {"account.balance": payload["balance"], "account.equity": payload.get("equity", payload["balance"])}})
    return {"ok": True, "server_time": now_iso()}


@api.get("/mt5/signals/pending")
async def mt5_pending(x_ea_token: Optional[str] = Header(None)):
    _check_ea(x_ea_token)
    s = await get_settings()
    if s["emergency_stop"] or s["mode"] != "LIVE":
        return {}  # only push to broker in LIVE mode; PAPER/DEMO never execute
    sig = await db.signals.find_one({"status": "APPROVED", "executed": False}, {"_id": 0}, sort=[("created_at", 1)])
    return sig or {}


@api.post("/mt5/signals/{signal_id}/executed")
async def mt5_executed(signal_id: str, payload: dict = Body(...), x_ea_token: Optional[str] = Header(None)):
    _check_ea(x_ea_token)
    sig = await db.signals.find_one({"signal_id": signal_id}, {"_id": 0})
    if not sig:
        raise HTTPException(404, "signal not found")
    executed = payload.get("executed", False)
    await db.signals.update_one({"signal_id": signal_id}, {"$set": {"executed": True, "status": "EXECUTED" if executed else "EXEC_FAILED"}})
    await db.execution_logs.insert_one({"signal_id": signal_id, "executed": executed, "ticket": payload.get("ticket"), "price": payload.get("price"), "created_at": now_iso()})
    if executed:
        await db.positions.insert_one({
            "position_id": f"POS-{signal_id}", "signal_id": signal_id, "symbol": sig["symbol"],
            "direction": sig["direction"], "entry": payload.get("price", sig["entry"]),
            "stop_loss": sig["stop_loss"], "take_profit": sig["take_profit"], "ticket": payload.get("ticket"),
            "status": "OPEN", "opened_at": now_iso(),
        })
    return {"ok": True}


@api.post("/mt5/account")
async def mt5_account(payload: dict = Body(...), x_ea_token: Optional[str] = Header(None)):
    _check_ea(x_ea_token)
    upd = {f"account.{k}": v for k, v in payload.items()}
    await db.settings.update_one({"key": "app"}, {"$set": upd})
    return {"ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    from db import client
    client.close()
