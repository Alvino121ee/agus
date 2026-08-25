import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Panel, StatusBadge, EmptyState } from "@/components/common";
import { SYMBOLS, TIMEFRAMES, selectClass } from "@/lib/constants";
import { FlaskConical, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_ACTIONS = {
  VALIDATING: ["APPROVED", "REJECTED"],
  APPROVED: ["LIVE", "PAUSED", "REJECTED"],
  LIVE: ["PAUSED"],
  PAUSED: ["LIVE", "REJECTED"],
  REJECTED: ["VALIDATING"],
  DRAFT: ["VALIDATING"],
  BACKTESTING: ["VALIDATING"],
};

export default function StrategyLab() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [tf, setTf] = useState("M15");
  const [minRr, setMinRr] = useState(2.0);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);

  const load = async () => { const l = await api.getStrategies(); setList(l); if (!sel && l[0]) setSel(l[0]); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setLoading(true);
    try {
      const s = await api.createStrategy({ symbol, timeframe: tf, min_rr: Number(minRr) });
      toast.success(`${s.strategy_id} created · ${s.status}`);
      await load(); setSel(s);
    } catch (e) { toast.error("Create failed"); } finally { setLoading(false); }
  };

  const changeStatus = async (id, status) => {
    await api.setStrategyStatus(id, status);
    toast.success(`Status → ${status}`);
    const l = await api.getStrategies(); setList(l);
    setSel(l.find((x) => x.strategy_id === id));
  };

  return (
    <div className="space-y-6" data-testid="strategy-lab-page">
      <div>
        <h1 className="text-2xl font-bold">AI Strategy Lab</h1>
        <p className="text-sm text-txt-secondary mt-1">Find Pattern → Hypothesis → Rules → Backtest → Critique → Validation → Approval</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Panel title="Create Strategy" testId="create-strategy-form">
            <div className="space-y-3">
              <label className="block text-xs text-txt-secondary">Symbol
                <select className={cn(selectClass, "w-full mt-1")} value={symbol} onChange={(e) => setSymbol(e.target.value)}>{SYMBOLS.map((s) => <option key={s}>{s}</option>)}</select>
              </label>
              <label className="block text-xs text-txt-secondary">Timeframe
                <select className={cn(selectClass, "w-full mt-1")} value={tf} onChange={(e) => setTf(e.target.value)}>{TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}</select>
              </label>
              <label className="block text-xs text-txt-secondary">Minimum RR
                <input type="number" step="0.1" min="1" className={cn(selectClass, "w-full mt-1")} value={minRr} onChange={(e) => setMinRr(e.target.value)} />
              </label>
              <button data-testid="create-strategy-btn" onClick={create} disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand/85 text-white text-sm py-2 rounded-sm transition-colors duration-150 disabled:opacity-60">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />} Build with AI
              </button>
              <p className="text-[11px] text-txt-muted">Anti-overfit: validated on in-sample & out-of-sample. Collapse OOS → REJECTED.</p>
            </div>
          </Panel>

          <Panel title="Strategies" className="p-0" testId="strategy-list">
            {list.length ? list.map((s) => (
              <button key={s.strategy_id} onClick={() => setSel(s)} data-testid={`strategy-item-${s.strategy_id}`}
                className={cn("w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] transition-colors duration-150", sel?.strategy_id === s.strategy_id && "bg-white/[0.04]")}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{s.name}</span>
                  <StatusBadge value={s.status} />
                </div>
                <div className="text-[11px] text-txt-muted font-mono mt-1">{s.strategy_id} · {s.symbols?.[0]} {s.timeframes?.[0]}</div>
              </button>
            )) : <EmptyState icon={FlaskConical} title="No strategies yet" hint="Build your first AI strategy." />}
          </Panel>
        </div>

        <div className="lg:col-span-2">
          {sel ? (
            <Panel title={`${sel.strategy_id} · ${sel.name}`} testId="strategy-detail"
              action={<StatusBadge value={sel.status} />}>
              <p className="text-sm text-txt-secondary">{sel.description}</p>
              {sel.overfit_flag && (
                <div className="mt-3 flex items-start gap-2 text-xs text-loss border border-loss/30 bg-loss/5 rounded-sm p-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> <span>Overfit risk: {sel.overfit_reasons?.join("; ")}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Rule label="Entry Rules" v={sel.entry_rules} />
                <Rule label="Exit Rules" v={sel.exit_rules} />
                <Rule label="SL Rules" v={sel.sl_rules} />
                <Rule label="TP Rules" v={sel.tp_rules} />
                <Rule label="Risk Rules" v={sel.risk_rules} />
                <Rule label="Regime / RR" v={`${sel.market_regime} · min ${sel.min_rr} / max ${sel.max_rr}`} />
              </div>

              <div className="text-[11px] uppercase tracking-wider text-txt-secondary mt-5 mb-2">Backtest</div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                <Metric label="Trades" v={sel.backtest?.total_trades} />
                <Metric label="Win Rate" v={`${sel.backtest?.win_rate ?? "—"}%`} />
                <Metric label="Profit Factor" v={sel.backtest?.profit_factor} />
                <Metric label="Expectancy" v={`${sel.backtest?.expectancy ?? "—"}R`} tone={sel.backtest?.expectancy > 0 ? "text-profit" : "text-loss"} />
                <Metric label="Avg R" v={sel.backtest?.avg_r} />
                <Metric label="Max DD" v={`${sel.backtest?.max_drawdown_r ?? "—"}R`} tone="text-loss" />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="border border-white/10 rounded-sm p-3">
                  <div className="text-[10px] uppercase tracking-wider text-txt-secondary mb-1">In-Sample</div>
                  <div className="font-mono text-xs text-txt-secondary">trades {sel.in_sample?.total_trades} · exp {sel.in_sample?.expectancy}R · pf {sel.in_sample?.profit_factor}</div>
                </div>
                <div className="border border-white/10 rounded-sm p-3">
                  <div className="text-[10px] uppercase tracking-wider text-txt-secondary mb-1">Out-of-Sample</div>
                  <div className="font-mono text-xs text-txt-secondary">trades {sel.out_of_sample?.total_trades} · exp {sel.out_of_sample?.expectancy}R · pf {sel.out_of_sample?.profit_factor}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-white/10">
                {(STATUS_ACTIONS[sel.status] || []).map((st) => (
                  <button key={st} data-testid={`status-${st}`} onClick={() => changeStatus(sel.strategy_id, st)}
                    className={cn("text-xs px-3 py-1.5 rounded-sm border transition-colors duration-150",
                      st === "LIVE" ? "border-profit/40 text-profit hover:bg-profit/10" :
                      st === "REJECTED" ? "border-loss/40 text-loss hover:bg-loss/10" :
                      "border-white/15 text-txt-secondary hover:bg-white/5")}>
                    Set {st}
                  </button>
                ))}
              </div>
            </Panel>
          ) : <EmptyState icon={FlaskConical} title="Select or create a strategy" />}
        </div>
      </div>
    </div>
  );
}

const Rule = ({ label, v }) => (
  <div className="border border-white/10 rounded-sm p-3">
    <div className="text-[10px] uppercase tracking-wider text-txt-secondary mb-1">{label}</div>
    <div className="text-sm text-txt-primary">{v}</div>
  </div>
);
const Metric = ({ label, v, tone }) => (
  <div className="bg-term-elevated/40 border border-white/10 rounded-sm p-2 text-center">
    <div className="text-[10px] uppercase tracking-wider text-txt-secondary">{label}</div>
    <div className={cn("font-mono font-bold mt-0.5", tone || "text-txt-primary")}>{v ?? "—"}</div>
  </div>
);
