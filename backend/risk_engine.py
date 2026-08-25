"""Risk Engine — independent of the AI. Can HARD REJECT any signal.

The AI never has full control over risk. User-defined limits are enforced here
against live account/session state.
"""

DEFAULT_RISK = {
    "risk_per_trade_pct": 1.0,
    "max_daily_loss_pct": 3.0,
    "max_weekly_loss_pct": 6.0,
    "max_drawdown_pct": 15.0,
    "max_open_positions": 3,
    "max_exposure_pct": 10.0,
    "max_lot": 1.0,
    "max_consecutive_losses": 4,
    "min_rr": 2.0,
    "confidence_threshold": 80,
}


def evaluate(signal: dict, risk_cfg: dict, account_state: dict) -> dict:
    """Return {allowed: bool, events: [str], hard_reject: bool}."""
    events = []
    a = account_state
    if a.get("daily_loss_pct", 0) >= risk_cfg["max_daily_loss_pct"]:
        events.append(f"Daily loss limit exceeded ({a.get('daily_loss_pct',0)}% >= {risk_cfg['max_daily_loss_pct']}%)")
    if a.get("weekly_loss_pct", 0) >= risk_cfg["max_weekly_loss_pct"]:
        events.append(f"Weekly loss limit exceeded ({a.get('weekly_loss_pct',0)}% >= {risk_cfg['max_weekly_loss_pct']}%)")
    if a.get("drawdown_pct", 0) >= risk_cfg["max_drawdown_pct"]:
        events.append(f"Max drawdown exceeded ({a.get('drawdown_pct',0)}% >= {risk_cfg['max_drawdown_pct']}%)")
    if a.get("open_positions", 0) >= risk_cfg["max_open_positions"]:
        events.append(f"Max open positions reached ({a.get('open_positions',0)} >= {risk_cfg['max_open_positions']})")
    if a.get("exposure_pct", 0) >= risk_cfg["max_exposure_pct"]:
        events.append(f"Max exposure reached ({a.get('exposure_pct',0)}% >= {risk_cfg['max_exposure_pct']}%)")
    if a.get("consecutive_losses", 0) >= risk_cfg["max_consecutive_losses"]:
        events.append(f"Max consecutive losses hit ({a.get('consecutive_losses',0)} >= {risk_cfg['max_consecutive_losses']})")
    if signal.get("risk_reward", 0) < risk_cfg["min_rr"]:
        events.append(f"RR {signal.get('risk_reward')} below minimum {risk_cfg['min_rr']}")
    if a.get("emergency_stop"):
        events.append("Emergency Stop is ACTIVE — trading halted")

    allowed = len(events) == 0
    return {"allowed": allowed, "hard_reject": not allowed, "events": events}
