"""Agent Orchestrator.

ANALYZE -> BUILD -> CRITIQUE -> VALIDATE -> DECIDE -> RISK CHECK -> (SIGNAL).
Runs all 10 agents, applies consensus voting + veto, computes evidence-based
confidence, runs the independent Risk Engine, and only emits a signal when
every layer approves.
"""
import time
from datetime import datetime, timezone
import market_data
import agents
import risk_engine
from db import now_iso

CONF_WEIGHTS = {
    "structure_analyst": 0.18,
    "technical_analyst": 0.15,
    "price_action": 0.15,
    "market_scanner": 0.10,
    "rr_optimizer": 0.18,
    "historical_validation": 0.10,
    "strategy_critic": 0.14,
}

DIRECTIONAL_AGENTS = ["market_scanner", "structure_analyst", "technical_analyst", "price_action"]


def _ts():
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


async def run_pipeline(db, symbol, timeframe, risk_cfg, mode, account_state):
    started = time.time()
    run_id = f"RUN-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    timeline = []
    outputs = {}
    ctx = {"min_rr": risk_cfg["min_rr"]}

    snapshot = market_data.build_snapshot(symbol, timeframe, salt=f"{run_id}-{time.time_ns()}")
    timeline.append({"time": _ts(), "event": "Data Normalizer", "detail": f"{symbol} {timeframe} snapshot built"})

    order = ["market_scanner", "structure_analyst", "technical_analyst", "price_action", "market_regime",
             "strategy_builder", "rr_optimizer", "strategy_critic", "historical_validation"]
    for key in order:
        out = await agents.run_agent(key, snapshot, ctx)
        outputs[key] = out
        ctx[key] = out
        timeline.append({"time": _ts(), "event": out["name"], "detail": f"{out['decision']} · score {out['score']}", "decision": out["decision"], "score": out["score"]})

    # ---- Consensus + veto ----
    strategy = outputs["strategy_builder"]
    rr = outputs["rr_optimizer"]
    critic = outputs["strategy_critic"]
    regime = outputs["market_regime"]

    veto_reasons = []
    if regime["output"].get("veto"):
        veto_reasons.append("Market Regime veto (CHOPPY)")
    if not rr["output"].get("rr_valid"):
        veto_reasons.append("Risk/Reward veto (RR_INVALID)")
    if critic["decision"] == "REJECT":
        veto_reasons.append("Strategy Critic veto (REJECT)")
    if strategy["decision"] == "NO_TRADE" or not strategy["output"].get("chosen"):
        veto_reasons.append("No valid strategy candidate")

    direction = None
    if strategy["output"].get("chosen"):
        direction = strategy["output"]["chosen"]["direction"]

    # directional agreement
    agree = 0
    for a in DIRECTIONAL_AGENTS:
        d = outputs[a]["decision"]
        if direction == "BUY" and d == "BULLISH":
            agree += 1
        elif direction == "SELL" and d == "BEARISH":
            agree += 1

    # weighted confidence
    conf = 0.0
    for k, w in CONF_WEIGHTS.items():
        conf += outputs[k]["score"] * w
    confidence = int(round(conf))

    threshold = risk_cfg["confidence_threshold"]
    if veto_reasons:
        final_decision = "NO_TRADE"
    elif agree >= 3 and confidence >= threshold and direction in ("BUY", "SELL"):
        final_decision = direction
    else:
        final_decision = "NO_TRADE"
        if not veto_reasons:
            if agree < 3:
                veto_reasons.append(f"Insufficient directional consensus ({agree}/4)")
            if confidence < threshold:
                veto_reasons.append(f"Confidence {confidence} below threshold {threshold}")

    confidence_breakdown = {
        "STRUCTURE": outputs["structure_analyst"]["score"],
        "MOMENTUM": outputs["technical_analyst"]["score"],
        "PRICE_ACTION": outputs["price_action"]["score"],
        "VOLATILITY": outputs["market_scanner"]["score"],
        "RISK_REWARD": outputs["rr_optimizer"]["score"],
        "HISTORICAL": outputs["historical_validation"]["score"],
        "CRITIC": outputs["strategy_critic"]["score"],
        "FINAL_SCORE": confidence,
    }

    final_agent = {
        "agent_id": "final_decision",
        "name": "Final Decision Agent",
        "role": agents.AGENT_META["final_decision"]["role"],
        "version": "1.0.0",
        "status": "OK",
        "source": "CONSENSUS_ENGINE",
        "execution_time_ms": 0,
        "tokens": 0,
        "score": confidence,
        "decision": final_decision,
        "reason": ("; ".join(veto_reasons) if final_decision == "NO_TRADE" else f"Consensus {agree}/4 directional agents agree, confidence {confidence} >= {threshold}."),
        "output": {"final_direction": final_decision, "confidence": confidence, "agreement": f"{agree}/4", "veto_reasons": veto_reasons, "breakdown": confidence_breakdown},
    }
    outputs["final_decision"] = final_agent
    timeline.append({"time": _ts(), "event": "Final Decision", "detail": f"{final_decision} · confidence {confidence}", "decision": final_decision, "score": confidence})

    # ---- Risk Engine ----
    risk_result = {"allowed": final_decision != "NO_TRADE", "hard_reject": False, "events": []}
    signal_doc = None
    if final_decision in ("BUY", "SELL"):
        prospective = {"risk_reward": rr["output"].get("risk_reward", 0)}
        risk_result = risk_engine.evaluate(prospective, risk_cfg, account_state)
        timeline.append({"time": _ts(), "event": "Risk Engine", "detail": ("PASSED" if risk_result["allowed"] else "BLOCKED: " + "; ".join(risk_result["events"])), "decision": "PASS" if risk_result["allowed"] else "BLOCK"})

    approved = final_decision in ("BUY", "SELL") and risk_result["allowed"]
    status = "APPROVED" if approved else ("BLOCKED" if final_decision in ("BUY", "SELL") else "NO_TRADE")

    if approved:
        seq = await db.signals.count_documents({}) + 1
        signal_doc = {
            "signal_id": f"SIG-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{seq:04d}",
            "run_id": run_id,
            "symbol": symbol.upper(),
            "timeframe": timeframe,
            "direction": final_decision,
            "entry_type": "MARKET",
            "entry": rr["output"]["entry"],
            "stop_loss": rr["output"]["stop_loss"],
            "take_profit": rr["output"]["take_profit"],
            "risk_reward": rr["output"]["risk_reward"],
            "confidence": confidence,
            "strategy_name": strategy["output"]["chosen"]["name"],
            "reason": f"{outputs['structure_analyst']['output'].get('pattern','')} + {strategy['output']['chosen']['name']}",
            "status": "APPROVED",
            "mode": mode,
            "executed": False,
            "created_at": now_iso(),
        }
        timeline.append({"time": _ts(), "event": "Signal Engine", "detail": f"Signal {signal_doc['signal_id']} APPROVED", "decision": "APPROVED"})
        await db.signals.insert_one(dict(signal_doc))
        signal_doc.pop("_id", None)

    run_doc = {
        "run_id": run_id,
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "mode": mode,
        "snapshot": snapshot,
        "agents": [outputs[k] for k in agents.AGENT_ORDER],
        "final_decision": final_decision,
        "confidence": confidence,
        "confidence_breakdown": confidence_breakdown,
        "veto_reasons": veto_reasons,
        "risk_result": risk_result,
        "status": status,
        "timeline": timeline,
        "signal_id": signal_doc["signal_id"] if signal_doc else None,
        "duration_ms": int((time.time() - started) * 1000),
        "created_at": now_iso(),
    }
    await db.agent_runs.insert_one(dict(run_doc))
    run_doc.pop("_id", None)

    # audit log
    await db.audit_logs.insert_one({
        "type": "PIPELINE_RUN", "run_id": run_id, "symbol": symbol.upper(),
        "decision": final_decision, "status": status, "confidence": confidence,
        "created_at": now_iso(),
    })

    return run_doc
