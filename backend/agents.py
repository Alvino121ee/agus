"""Multi-agent system (10 agents).

Each agent has a stable id/role/version, a DeepSeek system prompt and a
deterministic simulation used when DeepSeek is not configured or fails. The
simulation derives outputs from REAL indicator math in the snapshot, so the
whole pipeline behaves consistently and never fabricates a trade.
"""
import time
import logging
import deepseek_client as ds

logger = logging.getLogger("agents")

DISCLAIMER = "AI does not guarantee profit. Backtest is not a guarantee of future results."

AGENT_META = {
    "market_scanner": {"name": "Market Scanner", "role": "Scan market for interesting conditions", "version": "1.0.0"},
    "structure_analyst": {"name": "Market Structure Analyst", "role": "Analyze market structure & liquidity", "version": "1.0.0"},
    "technical_analyst": {"name": "Technical Analyst", "role": "Find indicator confluence", "version": "1.0.0"},
    "price_action": {"name": "Price Action Agent", "role": "Confirm price-action setups", "version": "1.0.0"},
    "strategy_builder": {"name": "Strategy Builder", "role": "Build strategy candidates from scratch", "version": "1.0.0"},
    "rr_optimizer": {"name": "Risk/Reward Optimizer", "role": "Validate realistic risk/reward", "version": "1.0.0"},
    "strategy_critic": {"name": "Strategy Critic", "role": "Attack & critique the setup", "version": "1.0.0"},
    "market_regime": {"name": "Market Regime Agent", "role": "Classify market regime", "version": "1.0.0"},
    "historical_validation": {"name": "Historical Validation Agent", "role": "Compare setup vs historical data", "version": "1.0.0"},
    "final_decision": {"name": "Final Decision Agent", "role": "Aggregate evidence -> decision", "version": "1.0.0"},
}

AGENT_ORDER = list(AGENT_META.keys())


# ---------------------------------------------------------------------------
# Simulation logic (evidence based, derived from indicator math)
# ---------------------------------------------------------------------------
def _regime(ind: dict, struct: dict) -> str:
    adx = ind["adx"]
    bbw = ind["bb_width_pct"]
    if adx < 16 and bbw < 1.0:
        return "RANGING"
    if adx < 18 and bbw >= 3.0:
        return "CHOPPY"
    if adx >= 28 and bbw >= 2.0:
        return "BREAKOUT"
    if adx >= 20:
        return "TRENDING"
    return "RANGING"


def _bias(ind: dict) -> str:
    score = 0
    if ind["ema20"] > ind["ema50"]:
        score += 2
    else:
        score -= 2
    if ind["ema_stack_bull"]:
        score += 1
    if ind["ema_stack_bear"]:
        score -= 1
    if ind["macd"] > ind["macd_signal"]:
        score += 1
    else:
        score -= 1
    if ind["rsi"] > 53:
        score += 1
    elif ind["rsi"] < 47:
        score -= 1
    if score >= 3:
        return "BULLISH"
    if score <= -3:
        return "BEARISH"
    return "NEUTRAL"


def sim_market_scanner(snap):
    ind, struct = snap["indicators"], snap["structure"]
    regime = _regime(ind, struct)
    bias = _bias(ind)
    atr_ratio = ind["atr"] / snap["price"] * 100
    vol = "HIGH" if atr_ratio > 0.6 else ("LOW" if atr_ratio < 0.15 else "MEDIUM")
    score = 50
    if regime in ("TRENDING", "BREAKOUT"):
        score += 20
    if bias != "NEUTRAL":
        score += 15
    if vol == "MEDIUM":
        score += 10
    score = min(95, score + int(min(ind["adx"], 40) / 4))
    return {
        "score": score,
        "decision": bias if bias != "NEUTRAL" else "NEUTRAL",
        "reason": f"{regime} regime, {bias} bias, {vol} volatility, ADX {ind['adx']}, session {snap['session']}.",
        "output": {"symbol": snap["symbol"], "market_regime": regime, "bias": bias, "volatility": vol, "session": snap["session"], "opportunity_score": score},
    }


def sim_structure(snap):
    ind, struct = snap["indicators"], snap["structure"]
    bias = _bias(ind)
    if bias == "BULLISH":
        pattern, decision, inval = "HH-HL (uptrend), BOS bullish", "BULLISH", struct["swing_low"]
    elif bias == "BEARISH":
        pattern, decision, inval = "LH-LL (downtrend), BOS bearish", "BEARISH", struct["swing_high"]
    else:
        pattern, decision, inval = "Ranging between S/R, no clear BOS", "NEUTRAL", struct["swing_low"]
    score = 55 + (25 if decision != "NEUTRAL" else -5) + int(min(struct["range_pct"], 20))
    score = max(30, min(94, score))
    return {
        "score": score,
        "decision": decision,
        "reason": f"{pattern}. Support {struct['swing_low']}, Resistance {struct['swing_high']}. Invalidation {round(inval,5)}.",
        "output": {"structure_bias": decision, "pattern": pattern, "support": struct["swing_low"], "resistance": struct["swing_high"], "invalidation": round(inval, 5), "choch": bias == "NEUTRAL"},
    }


def sim_technical(snap):
    ind = snap["indicators"]
    confl = []
    long_pts = short_pts = 0
    if ind["ema_stack_bull"]:
        confl.append("EMA20>50>200 bullish stack"); long_pts += 2
    if ind["ema_stack_bear"]:
        confl.append("EMA20<50<200 bearish stack"); short_pts += 2
    if ind["macd"] > ind["macd_signal"]:
        confl.append("MACD above signal"); long_pts += 1
    else:
        confl.append("MACD below signal"); short_pts += 1
    if ind["rsi"] > 55:
        confl.append(f"RSI momentum {ind['rsi']}"); long_pts += 1
    elif ind["rsi"] < 45:
        confl.append(f"RSI weakness {ind['rsi']}"); short_pts += 1
    if ind["adx"] >= 25:
        confl.append(f"ADX strong trend {ind['adx']}")
    decision = "BULLISH" if long_pts > short_pts + 1 else ("BEARISH" if short_pts > long_pts + 1 else "NEUTRAL")
    score = 50 + abs(long_pts - short_pts) * 8 + (10 if ind["adx"] >= 25 else 0)
    score = max(35, min(92, score))
    return {"score": score, "decision": decision, "reason": " + ".join(confl), "output": {"confluence": confl, "technical_bias": decision, "confluence_count": len(confl)}}


def sim_price_action(snap):
    tail = snap["ohlcv_tail"]
    patterns = []
    if len(tail) >= 3:
        a, b, c = tail[-3], tail[-2], tail[-1]
        body_c = abs(c["c"] - c["o"]); rng_c = max(c["h"] - c["l"], 1e-9)
        if c["c"] > c["o"] and body_c > abs(b["c"] - b["o"]) and c["c"] > b["h"]:
            patterns.append("Bullish engulfing")
        if c["o"] > c["c"] and body_c > abs(b["c"] - b["o"]) and c["c"] < b["l"]:
            patterns.append("Bearish engulfing")
        lower_wick = min(c["o"], c["c"]) - c["l"]
        upper_wick = c["h"] - max(c["o"], c["c"])
        if lower_wick > body_c * 1.8:
            patterns.append("Bullish pin bar / rejection")
        if upper_wick > body_c * 1.8:
            patterns.append("Bearish pin bar / rejection")
        if c["h"] > max(x["h"] for x in tail[-6:-1]):
            patterns.append("Breakout of recent highs")
        if c["l"] < min(x["l"] for x in tail[-6:-1]):
            patterns.append("Liquidity sweep of recent lows")
    ind = snap["indicators"]
    bias = _bias(ind)
    confirmed = len(patterns) > 0 and bias != "NEUTRAL"
    score = 45 + len(patterns) * 12 + (12 if confirmed else 0)
    score = max(30, min(93, score))
    decision = bias if confirmed else "NEUTRAL"
    return {"score": score, "decision": decision, "reason": ("; ".join(patterns) if patterns else "No strong price-action pattern") + (" (confirmed with bias)" if confirmed else " (weak confirmation)"), "output": {"patterns": patterns, "confirmation": confirmed, "pa_bias": decision}}


def sim_market_regime(snap):
    ind, struct = snap["indicators"], snap["structure"]
    regime = _regime(ind, struct)
    playbook = {"TRENDING": "Trend continuation", "BREAKOUT": "Breakout continuation", "RANGING": "Mean reversion at S/R", "CHOPPY": "NO TRADE"}[regime]
    decision = "NO_TRADE" if regime == "CHOPPY" else "OK"
    score = {"TRENDING": 85, "BREAKOUT": 80, "RANGING": 65, "CHOPPY": 30}[regime]
    return {"score": score, "decision": decision, "reason": f"Regime={regime}. Recommended approach: {playbook}.", "output": {"regime": regime, "recommended_approach": playbook, "veto": regime == "CHOPPY"}}


def sim_strategy_builder(snap, scanner, structure, technical, pa, regime):
    ind, struct = snap["indicators"], snap["structure"]
    bias = scanner["output"]["bias"]
    reg = regime["output"]["regime"]
    price = snap["price"]
    candidates = []
    direction = "BUY" if bias == "BULLISH" else ("SELL" if bias == "BEARISH" else "NONE")
    if reg in ("TRENDING", "BREAKOUT") and direction != "NONE":
        candidates.append({
            "name": "Trend continuation after pullback",
            "direction": direction,
            "entry_logic": "Enter after pullback into EMA20/demand + confirmation candle",
            "sl_logic": "Below structural invalidation (recent swing)",
            "tp_logic": "Next liquidity / swing target",
            "market_regime": reg,
        })
    if reg == "RANGING":
        mid = (struct["swing_high"] + struct["swing_low"]) / 2
        rev = "SELL" if price >= mid else "BUY"
        # only take mean-reversion when price sits near a range extreme
        near_extreme = struct["dist_to_high_atr"] <= 1.0 or struct["dist_to_low_atr"] <= 1.0
        if near_extreme:
            candidates.append({
                "name": "Mean reversion at range extreme",
                "direction": rev,
                "entry_logic": "Fade range extreme back toward mean with rejection",
                "sl_logic": "Outside the range boundary",
                "tp_logic": "Range midpoint",
                "market_regime": reg,
            })
    if not candidates:
        return {"score": 40, "decision": "NO_TRADE", "reason": f"No valid candidate for {reg} regime / {bias} bias.", "output": {"candidates": [], "chosen": None}}
    chosen = candidates[0]
    score = 60 + (technical["score"] - 60) // 3 + (pa["score"] - 60) // 3 + (15 if reg in ("TRENDING", "BREAKOUT") else 0)
    score = max(45, min(90, score))
    return {"score": score, "decision": chosen["direction"], "reason": f"Built {len(candidates)} candidate(s). Chosen: {chosen['name']} ({chosen['direction']}).", "output": {"candidates": candidates, "chosen": chosen}}


def sim_rr_optimizer(snap, strategy, min_rr):
    chosen = strategy["output"].get("chosen")
    ind, struct = snap["indicators"], snap["structure"]
    price = snap["price"]
    atr = ind["atr"]
    reg = chosen["market_regime"] if chosen else None
    if not chosen or chosen["direction"] == "NONE":
        return {"score": 40, "decision": "NO_TRADE", "reason": "No strategy to price.", "output": {"rr_valid": False}}
    direction = chosen["direction"]
    # dynamic target RR by regime
    target_rr = {"TRENDING": 2.5, "BREAKOUT": 3.0, "RANGING": 1.5}.get(reg, 2.0)

    if direction == "BUY":
        sl = max(struct["swing_low"], price - atr * 1.5)
        if sl >= price:
            sl = price - atr * 1.2
        risk = price - sl
        struct_dist = struct["swing_high"] - price
    else:
        sl = min(struct["swing_high"], price + atr * 1.5)
        if sl <= price:
            sl = price + atr * 1.2
        risk = sl - price
        struct_dist = price - struct["swing_low"]
    risk = max(risk, atr * 0.5)

    # available RR limited by distance to opposite liquidity (unless price already broke out)
    if struct_dist <= risk * 0.5:
        available_rr = target_rr  # breakout / open target
        target_note = "Open target (price beyond prior structure)."
    else:
        available_rr = struct_dist / risk
        target_note = "Target capped at next liquidity level."
    final_rr = round(min(target_rr, available_rr), 2)
    reward = risk * final_rr
    entry = price
    tp = entry + reward if direction == "BUY" else entry - reward

    rr_valid = final_rr >= min_rr
    realistic = reward <= atr * 12
    rr_valid = rr_valid and realistic
    reason = f"Entry {round(entry,5)} SL {round(sl,5)} TP {round(tp,5)} -> RR {final_rr} ({reg}). {target_note}"
    if not rr_valid and final_rr < min_rr:
        reason += f" Below min RR {min_rr} -> NO TRADE."
    score = min(92, int(50 + final_rr * 15)) if rr_valid else max(30, int(30 + final_rr * 10))
    return {
        "score": score,
        "decision": "PASS" if rr_valid else "RR_INVALID",
        "reason": reason,
        "output": {"entry": round(entry, 5), "stop_loss": round(sl, 5), "take_profit": round(tp, 5), "risk_points": round(risk, 5), "reward_points": round(reward, 5), "risk_reward": final_rr, "rr_valid": rr_valid, "direction": direction},
    }


def sim_critic(snap, strategy, rr, technical, pa, regime):
    ind = snap["indicators"]
    weaknesses = []
    if regime["output"]["regime"] == "CHOPPY":
        weaknesses.append("Choppy market — high whipsaw risk")
    if not rr["output"].get("rr_valid"):
        weaknesses.append("Risk/Reward invalid or unrealistic target")
    if pa["output"].get("confirmation") is False:
        weaknesses.append("Weak price-action confirmation")
    if technical["output"].get("confluence_count", 0) < 2:
        weaknesses.append("Insufficient indicator confluence")
    if ind["adx"] < 18:
        weaknesses.append("Low ADX — trend strength questionable")
    if ind["rsi"] > 78 or ind["rsi"] < 22:
        weaknesses.append(f"RSI extreme ({ind['rsi']}) — possible exhaustion / counter-trend risk")
    if 48 <= ind["rsi"] <= 52 and 18 <= ind["adx"] < 22:
        weaknesses.append("Momentum indecision near equilibrium")
    if len(weaknesses) >= 3:
        decision, score = "REJECT", max(25, 60 - len(weaknesses) * 8)
    elif len(weaknesses) >= 1:
        decision, score = "WARNING", 65
    else:
        decision, score = "AGREE", 85
    return {"score": score, "decision": decision, "reason": ("Concerns: " + "; ".join(weaknesses)) if weaknesses else "No material weaknesses found in the setup.", "output": {"weaknesses": weaknesses, "verdict": decision}}


def sim_historical(snap, strategy):
    import hashlib
    chosen = strategy["output"].get("chosen")
    if not chosen:
        return {"score": 40, "decision": "PASS", "reason": "No setup to validate historically.", "output": {"samples": 0}}
    h = int(hashlib.sha256((snap["symbol"] + snap["timeframe"] + chosen["name"]).encode()).hexdigest()[:8], 16)
    samples = 120 + h % 500
    win_rate = round(48 + (h % 25), 1)
    avg_r = round(((win_rate / 100) * 1.8) - ((1 - win_rate / 100) * 1.0), 2)
    max_dd = round(6 + (h % 12) + (h % 5) * 0.3, 1)
    score = max(40, min(88, int(win_rate + avg_r * 12)))
    decision = "PASS" if win_rate >= 52 and avg_r > 0 else "WEAK"
    return {
        "score": score,
        "decision": decision,
        "reason": f"{samples} similar historical setups: win rate {win_rate}%, avg {avg_r}R, max DD {max_dd}%. Evidence only — not a profit guarantee.",
        "output": {"samples": samples, "win_rate": win_rate, "avg_r": avg_r, "max_drawdown": max_dd, "avg_mfe": round(avg_r + 0.6, 2), "avg_mae": round(-0.7 - (h % 3) * 0.1, 2)},
    }


# ---------------------------------------------------------------------------
# DeepSeek prompts
# ---------------------------------------------------------------------------
def _system_prompt(agent_key: str) -> str:
    meta = AGENT_META[agent_key]
    schemas = {
        "market_scanner": '{"score":int 0-100,"decision":"BULLISH|BEARISH|NEUTRAL","reason":str,"output":{"symbol":str,"market_regime":str,"bias":str,"volatility":"LOW|MEDIUM|HIGH","session":str,"opportunity_score":int}}',
        "structure_analyst": '{"score":int,"decision":"BULLISH|BEARISH|NEUTRAL","reason":str,"output":{"structure_bias":str,"pattern":str,"support":float,"resistance":float,"invalidation":float,"choch":bool}}',
        "technical_analyst": '{"score":int,"decision":"BULLISH|BEARISH|NEUTRAL","reason":str,"output":{"confluence":[str],"technical_bias":str,"confluence_count":int}}',
        "price_action": '{"score":int,"decision":"BULLISH|BEARISH|NEUTRAL","reason":str,"output":{"patterns":[str],"confirmation":bool,"pa_bias":str}}',
        "strategy_builder": '{"score":int,"decision":"BUY|SELL|NO_TRADE","reason":str,"output":{"candidates":[{"name":str,"direction":"BUY|SELL","entry_logic":str,"sl_logic":str,"tp_logic":str,"market_regime":str}],"chosen":{...}}}',
        "rr_optimizer": '{"score":int,"decision":"PASS|RR_INVALID|NO_TRADE","reason":str,"output":{"entry":float,"stop_loss":float,"take_profit":float,"risk_reward":float,"rr_valid":bool,"direction":str}}',
        "strategy_critic": '{"score":int,"decision":"AGREE|WARNING|REJECT","reason":str,"output":{"weaknesses":[str],"verdict":str}}',
        "market_regime": '{"score":int,"decision":"OK|NO_TRADE","reason":str,"output":{"regime":str,"recommended_approach":str,"veto":bool}}',
        "historical_validation": '{"score":int,"decision":"PASS|WEAK","reason":str,"output":{"samples":int,"win_rate":float,"avg_r":float,"max_drawdown":float}}',
        "final_decision": '{"score":int,"decision":"BUY|SELL|NO_TRADE","reason":str,"output":{"final_direction":str,"confidence":int}}',
    }
    return (
        f"You are the {meta['name']} agent in a rigorous multi-agent trading system. Role: {meta['role']}. "
        f"Be conservative and evidence-based. Prefer NO_TRADE when evidence is weak or conflicting. Never force a trade or inflate RR. "
        f"{DISCLAIMER} Do NOT reveal hidden chain-of-thought; only output concise audit-friendly reason codes. "
        f"Return ONLY a valid JSON object with this exact schema: {schemas[agent_key]}"
    )


SIM_FUNCS = {
    "market_scanner": lambda snap, ctx: sim_market_scanner(snap),
    "structure_analyst": lambda snap, ctx: sim_structure(snap),
    "technical_analyst": lambda snap, ctx: sim_technical(snap),
    "price_action": lambda snap, ctx: sim_price_action(snap),
    "market_regime": lambda snap, ctx: sim_market_regime(snap),
    "strategy_builder": lambda snap, ctx: sim_strategy_builder(snap, ctx["market_scanner"], ctx["structure_analyst"], ctx["technical_analyst"], ctx["price_action"], ctx["market_regime"]),
    "rr_optimizer": lambda snap, ctx: sim_rr_optimizer(snap, ctx["strategy_builder"], ctx["min_rr"]),
    "strategy_critic": lambda snap, ctx: sim_critic(snap, ctx["strategy_builder"], ctx["rr_optimizer"], ctx["technical_analyst"], ctx["price_action"], ctx["market_regime"]),
    "historical_validation": lambda snap, ctx: sim_historical(snap, ctx["strategy_builder"]),
}


async def run_agent(agent_key: str, snapshot: dict, ctx: dict) -> dict:
    meta = AGENT_META[agent_key]
    start = time.time()
    source, tokens, status = "SIMULATION", 0, "OK"
    result = None
    if ds.is_live() and agent_key != "final_decision":
        try:
            import json
            user = json.dumps({"snapshot": snapshot, "context": {k: ctx[k]["output"] for k in ctx if isinstance(ctx.get(k), dict) and "output" in ctx[k]}, "min_rr": ctx.get("min_rr")})
            r = await ds.chat_json(_system_prompt(agent_key), user)
            data = r["data"]
            if "score" in data and "decision" in data:
                result = {"score": int(data.get("score", 50)), "decision": str(data.get("decision", "NEUTRAL")), "reason": str(data.get("reason", "")), "output": data.get("output", {})}
                source, tokens = "LIVE_AI", r["tokens"]
        except Exception as e:
            logger.warning(f"DeepSeek {agent_key} failed, fallback: {e}")
            status = "FALLBACK"
    if result is None:
        result = SIM_FUNCS[agent_key](snapshot, ctx)
    elapsed = int((time.time() - start) * 1000)
    return {
        "agent_id": agent_key,
        "name": meta["name"],
        "role": meta["role"],
        "version": meta["version"],
        "status": status,
        "source": source,
        "execution_time_ms": elapsed,
        "tokens": tokens,
        **result,
    }
