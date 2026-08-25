"""Backend API tests for AI Trading Automation Multi-Agent app.

Modules covered:
  - status/deepseek, settings
  - analysis pipeline (10 agents, consensus, veto), signals
  - agents registry
  - strategy lab, backtest
  - risk engine blocking
  - controls (emergency stop, close all)
  - mt5 EA integration
  - performance, logs
"""
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

backend_env = dotenv_values("/app/backend/.env")
EA_TOKEN = backend_env.get("MT5_API_SECRET")

AGENT_IDS = {
    "market_scanner", "structure_analyst", "technical_analyst", "price_action",
    "strategy_builder", "rr_optimizer", "strategy_critic", "market_regime",
    "historical_validation", "final_decision",
}

SYMBOLS = [
    ("XAUUSD", "M15"), ("EURUSD", "H4"), ("GBPUSD", "M30"),
    ("BTCUSD", "H1"), ("NAS100", "H4"), ("EURUSD", "M5"),
]


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _validate_run(run):
    assert run["final_decision"] in ("BUY", "SELL", "NO_TRADE"), run["final_decision"]
    assert isinstance(run["confidence"], int)
    assert 0 <= run["confidence"] <= 100
    assert isinstance(run["veto_reasons"], list)
    assert isinstance(run["timeline"], list) and len(run["timeline"]) >= 10
    for ev in run["timeline"]:
        assert "time" in ev and "event" in ev
    assert run["status"] in ("APPROVED", "BLOCKED", "NO_TRADE")
    agents = run["agents"]
    assert len(agents) == 10, f"expected 10 agents got {len(agents)}"
    assert {a["agent_id"] for a in agents} == AGENT_IDS
    for a in agents:
        for f in ("agent_id", "name", "score", "decision", "reason", "output", "source", "execution_time_ms"):
            assert f in a, f"agent {a.get('agent_id')} missing {f}"
        assert isinstance(a["output"], dict)
    bd = run["confidence_breakdown"]
    for k in ("STRUCTURE", "MOMENTUM", "PRICE_ACTION", "VOLATILITY", "RISK_REWARD", "HISTORICAL", "CRITIC", "FINAL_SCORE"):
        assert k in bd
    # veto consistency
    om = {a["agent_id"]: a for a in agents}
    veto_present = (
        om["rr_optimizer"]["decision"] == "RR_INVALID"
        or om["market_regime"]["output"].get("veto")
        or om["strategy_critic"]["decision"] == "REJECT"
    )
    if veto_present:
        assert run["final_decision"] == "NO_TRADE", "veto did not force NO_TRADE"
        assert run["signal_id"] is None
    if run["final_decision"] == "NO_TRADE":
        assert run["signal_id"] is None
        assert len(run["veto_reasons"]) > 0


# ---------------- Read-mostly endpoints ----------------
class TestReadEndpoints:
    def test_root(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        assert "AI does not guarantee profit" in r.json()["disclaimer"]

    def test_deepseek_status(self, client):
        r = client.get(f"{API}/status/deepseek")
        assert r.status_code == 200
        d = r.json()
        assert d["mode"] == "SIMULATION"
        assert d["model"] == "deepseek-chat"

    def test_agents_list(self, client):
        r = client.get(f"{API}/agents")
        assert r.status_code == 200
        d = r.json()
        assert len(d["agents"]) == 10
        assert {a["agent_id"] for a in d["agents"]} == AGENT_IDS
        for a in d["agents"]:
            assert a["name"] and a["role"]

    def test_signals_list(self, client):
        r = client.get(f"{API}/signals")
        assert r.status_code == 200
        sigs = r.json()
        assert isinstance(sigs, list)
        for s in sigs:
            assert "_id" not in s
            for f in ("signal_id", "symbol", "direction", "entry", "stop_loss", "take_profit",
                      "risk_reward", "confidence", "strategy_name", "status"):
                assert f in s

    def test_signal_detail_404(self, client):
        r = client.get(f"{API}/signals/SIG-DOES-NOT-EXIST")
        assert r.status_code == 404

    def test_performance(self, client):
        r = client.get(f"{API}/performance")
        assert r.status_code == 200
        d = r.json()
        for k in ("runs", "signals", "no_trade_rate", "total_trades"):
            assert k in d

    def test_logs(self, client):
        r = client.get(f"{API}/logs")
        assert r.status_code == 200
        d = r.json()
        for k in ("audit", "execution", "risk"):
            assert isinstance(d[k], list)

    def test_positions_and_trades(self, client):
        for ep in ("positions", "trades", "backtests", "analysis/runs", "strategies"):
            r = client.get(f"{API}/{ep}")
            assert r.status_code == 200, ep
            assert isinstance(r.json(), list), ep

    def test_run_detail_404(self, client):
        r = client.get(f"{API}/analysis/runs/RUN-NOPE")
        assert r.status_code == 404


# ---------------- Backtest + Strategy Lab ----------------
class TestBacktestAndStrategy:
    def test_backtest_run(self, client):
        r = client.post(f"{API}/backtest/run", json={"symbol": "XAUUSD", "timeframe": "M15", "min_rr": 2.0})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "overfit_flag" in d and "status" in d
        full = d["full"]
        for k in ("total_trades", "win_rate", "profit_factor", "expectancy",
                  "max_drawdown_r", "sharpe", "sortino", "equity_curve"):
            assert k in full, k
        assert isinstance(full["equity_curve"], list)
        assert "in_sample" in d and "out_of_sample" in d
        assert isinstance(d["overfit_flag"], bool)

    def test_strategy_create_and_lifecycle(self, client):
        r = client.post(f"{API}/strategies/create", json={"symbol": "EURUSD", "timeframe": "H1", "min_rr": 2.0})
        assert r.status_code == 200, r.text
        d = r.json()
        sid = d["strategy_id"]
        for k in ("name", "entry_rules", "exit_rules", "sl_rules", "tp_rules",
                  "backtest", "in_sample", "out_of_sample", "overfit_flag", "status", "market_regime"):
            assert k in d, k
        assert "_id" not in d

        # GET detail persists
        g = client.get(f"{API}/strategies/{sid}")
        assert g.status_code == 200
        assert g.json()["strategy_id"] == sid

        # list contains it
        lst = client.get(f"{API}/strategies").json()
        assert any(x["strategy_id"] == sid for x in lst)

        # status update
        up = client.put(f"{API}/strategies/{sid}/status", json={"status": "APPROVED"})
        assert up.status_code == 200
        assert up.json()["status"] == "APPROVED"
        assert client.get(f"{API}/strategies/{sid}").json()["status"] == "APPROVED"

        # invalid status
        bad = client.put(f"{API}/strategies/{sid}/status", json={"status": "BOGUS"})
        assert bad.status_code == 400
        # unknown strategy
        nf = client.put(f"{API}/strategies/NOPE-999/status", json={"status": "LIVE"})
        assert nf.status_code == 404


# ---------------- MT5 EA integration ----------------
class TestMT5:
    def test_status(self, client):
        r = client.get(f"{API}/mt5/status")
        assert r.status_code == 200
        d = r.json()
        assert d["secret_configured"] is True
        assert d["mode"] in ("PAPER", "DEMO", "LIVE")

    def test_heartbeat_auth(self, client):
        r = client.post(f"{API}/mt5/heartbeat", json={"connection_id": "TEST_EA"})
        assert r.status_code == 401
        r = client.post(f"{API}/mt5/heartbeat", json={"connection_id": "TEST_EA"},
                        headers={"X-EA-Token": "wrong"})
        assert r.status_code == 401
        r = client.post(f"{API}/mt5/heartbeat",
                        json={"connection_id": "TEST_EA", "balance": 10000, "equity": 10000, "open_positions": 0},
                        headers={"X-EA-Token": EA_TOKEN})
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

    def test_pending_signals(self, client):
        r = client.get(f"{API}/mt5/signals/pending")
        assert r.status_code == 401
        r = client.get(f"{API}/mt5/signals/pending", headers={"X-EA-Token": EA_TOKEN})
        assert r.status_code == 200
        # mode should be PAPER by default -> empty dict
        mode = client.get(f"{API}/mt5/status").json()["mode"]
        if mode != "LIVE":
            assert r.json() == {}

    def test_ea_file(self, client):
        r = client.get(f"{API}/mt5/ea-file")
        assert r.status_code == 200
        assert "OnTick" in r.text or "#property" in r.text

    def test_executed_unknown_signal(self, client):
        r = client.post(f"{API}/mt5/signals/NOPE/executed", json={"executed": True},
                        headers={"X-EA-Token": EA_TOKEN})
        assert r.status_code == 404


# ---------------- Pipeline + settings + controls (stateful, keep serial) ----------------
class TestPipelineAndControls:
    def test_settings_get_and_invalid_mode(self, client):
        r = client.get(f"{API}/settings")
        assert r.status_code == 200
        s = r.json()
        assert "_id" not in s
        for k in ("mode", "emergency_stop", "risk", "news_filter", "account"):
            assert k in s
        for k in ("min_rr", "confidence_threshold", "max_daily_loss_pct"):
            assert k in s["risk"]
        bad = client.put(f"{API}/settings", json={"mode": "TURBO"})
        assert bad.status_code == 400

    def test_settings_update_persists(self, client):
        orig = client.get(f"{API}/settings").json()
        r = client.put(f"{API}/settings", json={
            "mode": "DEMO",
            "risk": {"min_rr": 2.5},
            "news_filter": {"enabled": True, "policy": "BLOCK_TRADING"},
        })
        assert r.status_code == 200
        d = r.json()
        assert d["mode"] == "DEMO"
        assert d["risk"]["min_rr"] == 2.5
        assert d["news_filter"]["enabled"] is True
        again = client.get(f"{API}/settings").json()
        assert again["mode"] == "DEMO" and again["risk"]["min_rr"] == 2.5
        # restore
        client.put(f"{API}/settings", json={
            "mode": "PAPER", "risk": {"min_rr": orig["risk"]["min_rr"]},
            "news_filter": orig["news_filter"]})

    @pytest.mark.parametrize("symbol,timeframe", SYMBOLS)
    def test_analysis_run(self, client, symbol, timeframe):
        r = client.post(f"{API}/analysis/run", json={"symbol": symbol, "timeframe": timeframe})
        assert r.status_code == 200, r.text
        run = r.json()
        assert "_id" not in run
        assert run["symbol"] == symbol
        _validate_run(run)
        # run detail retrievable
        det = client.get(f"{API}/analysis/runs/{run['run_id']}")
        assert det.status_code == 200
        assert det.json()["run_id"] == run["run_id"]
        # if approved, signal must exist in /signals
        if run["signal_id"]:
            sig = client.get(f"{API}/signals/{run['signal_id']}")
            assert sig.status_code == 200, sig.text
            sd = sig.json()
            assert sd["status"] == "APPROVED"
            assert sd["direction"] == run["final_decision"]
            assert sd["risk_reward"] >= 2.0
            assert sd["entry"] and sd["stop_loss"] and sd["take_profit"]
            assert sd["strategy_name"]

    def test_risk_engine_blocks_signal(self, client):
        """Force daily loss breach; any BUY/SELL decision must be BLOCKED with no signal."""
        orig = client.get(f"{API}/settings").json()
        client.put(f"{API}/settings", json={"account": {"daily_loss_pct": 99.0}})
        try:
            blocked_seen = False
            for symbol, tf in [("EURUSD", "H4"), ("GBPUSD", "M30"), ("NAS100", "H4"),
                               ("XAUUSD", "H1"), ("BTCUSD", "H4"), ("EURUSD", "H1"),
                               ("USDJPY", "H4"), ("US30", "H1")]:
                run = client.post(f"{API}/analysis/run", json={"symbol": symbol, "timeframe": tf}).json()
                if run["final_decision"] in ("BUY", "SELL"):
                    blocked_seen = True
                    assert run["status"] == "BLOCKED", run["status"]
                    assert run["signal_id"] is None
                    assert run["risk_result"]["events"], "no risk events recorded"
                    assert run["risk_result"]["allowed"] is False
                    break
            if not blocked_seen:
                pytest.skip("No directional decision produced to exercise risk block")
        finally:
            client.put(f"{API}/settings", json={"account": {"daily_loss_pct": orig["account"].get("daily_loss_pct", 0.0)}})

    def test_emergency_stop_halts_analysis(self, client):
        r = client.post(f"{API}/controls/emergency-stop", json={"active": True})
        assert r.status_code == 200
        assert r.json()["emergency_stop"] is True
        try:
            a = client.post(f"{API}/analysis/run", json={"symbol": "XAUUSD", "timeframe": "M15"})
            assert a.status_code == 423, f"expected 423 got {a.status_code}"
            assert client.get(f"{API}/settings").json()["emergency_stop"] is True
        finally:
            c = client.post(f"{API}/controls/emergency-stop", json={"active": False})
            assert c.status_code == 200
            assert c.json()["emergency_stop"] is False
        ok = client.post(f"{API}/analysis/run", json={"symbol": "XAUUSD", "timeframe": "M15"})
        assert ok.status_code == 200

    def test_close_all_requires_confirm(self, client):
        r = client.post(f"{API}/controls/close-all", json={})
        assert r.status_code == 400
        r = client.post(f"{API}/controls/close-all", json={"confirm": True})
        assert r.status_code == 200
        assert isinstance(r.json()["closed"], int)

    def test_final_state_clean(self, client):
        client.put(f"{API}/settings", json={"mode": "PAPER"})
        client.post(f"{API}/controls/emergency-stop", json={"active": False})
        s = client.get(f"{API}/settings").json()
        assert s["mode"] == "PAPER" and s["emergency_stop"] is False
