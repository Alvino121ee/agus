import { useState } from "react";
import { SYMBOLS, TIMEFRAMES, selectClass } from "@/lib/constants";
import { decisionColor, StatusBadge, Panel } from "@/components/common";
import api from "@/lib/api";
import { toast } from "sonner";
import { Play, Loader2, TrendingUp, TrendingDown, Ban, ShieldCheck, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_LABELS } from "@/lib/agentLabels";

const ConfBar = ({ label, value }) => (
  <div className="flex items-center gap-3">
    <div className="w-28 text-[11px] uppercase tracking-wider text-txt-secondary">{label}</div>
    <div className="flex-1 h-2 bg-white/5 rounded-sm overflow-hidden">
      <div className={cn("h-full transition-all duration-500", value >= 80 ? "bg-profit" : value >= 60 ? "bg-warning" : "bg-loss")} style={{ width: `${value}%` }} />
    </div>
    <div className="w-8 text-right font-mono text-sm">{value}</div>
  </div>
);

export default function AIAnalysis() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [tf, setTf] = useState("M15");
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState(null);

  const doRun = async () => {
    setLoading(true);
    try {
      const r = await api.runAnalysis({ symbol, timeframe: tf });
      setRun(r);
      toast[r.final_decision === "NO_TRADE" ? "message" : "success"](`Decision: ${r.final_decision} · confidence ${r.confidence}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Analysis failed");
    } finally { setLoading(false); }
  };

  const dir = run?.final_decision;
  const DirIcon = dir === "BUY" ? TrendingUp : dir === "SELL" ? TrendingDown : Ban;
  const bd = run?.confidence_breakdown;

  return (
    <div className="space-y-6" data-testid="ai-analysis-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Analysis Pipeline</h1>
          <p className="text-sm text-txt-secondary mt-1">ANALYZE → BUILD → CRITIQUE → VALIDATE → DECIDE → RISK CHECK → SIGNAL</p>
        </div>
        <div className="flex items-center gap-2">
          <select data-testid="symbol-select" className={selectClass} value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select data-testid="timeframe-select" className={selectClass} value={tf} onChange={(e) => setTf(e.target.value)}>
            {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button data-testid="run-analysis-btn" onClick={doRun} disabled={loading}
            className="flex items-center gap-2 bg-brand hover:bg-brand/85 text-white text-sm font-medium px-4 py-1.5 rounded-sm transition-colors duration-150 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" strokeWidth={1.5} />}
            Run Agents
          </button>
        </div>
      </div>

      {!run && (
        <Panel testId="analysis-empty">
          <div className="py-12 text-center text-txt-secondary text-sm">
            Select a symbol & timeframe, then run the 10-agent pipeline. The system prefers <span className="text-txt-primary font-medium">NO_TRADE</span> unless every layer approves.
          </div>
        </Panel>
      )}

      {run && (
        <>
          {/* Decision banner */}
          <div data-testid="decision-banner" className={cn("border rounded-sm p-5 flex items-center justify-between",
            dir === "BUY" ? "border-profit/40 bg-profit/5" : dir === "SELL" ? "border-loss/40 bg-loss/5" : "border-white/10 bg-white/[0.02]")}>
            <div className="flex items-center gap-4">
              <DirIcon className={cn("w-9 h-9", decisionColor(dir))} strokeWidth={1.5} />
              <div>
                <div className={cn("text-2xl font-bold font-heading", decisionColor(dir))}>{dir}</div>
                <div className="text-xs text-txt-secondary mt-0.5">{run.symbol} · {run.timeframe} · run {run.run_id}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-txt-secondary">Confidence</div>
              <div className="text-3xl font-mono font-bold">{run.confidence}</div>
            </div>
            <div className="flex items-center gap-2">
              {run.status === "APPROVED" ? <ShieldCheck className="w-5 h-5 text-profit" /> : <ShieldX className="w-5 h-5 text-txt-muted" />}
              <StatusBadge value={run.status} />
            </div>
          </div>

          {run.veto_reasons?.length > 0 && (
            <div data-testid="veto-reasons" className="border border-warning/30 bg-warning/5 rounded-sm p-4">
              <div className="text-xs uppercase tracking-wider text-warning font-semibold mb-2">Veto / Block Reasons</div>
              <ul className="text-sm text-txt-secondary space-y-1 list-disc list-inside">
                {run.veto_reasons.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Confidence breakdown */}
            <Panel title="Confidence Breakdown (evidence-based)" className="lg:col-span-1" testId="confidence-breakdown">
              <div className="space-y-3">
                {bd && Object.entries(bd).filter(([k]) => k !== "FINAL_SCORE").map(([k, v]) => (
                  <ConfBar key={k} label={k.replace("_", " ")} value={v} />
                ))}
                <div className="pt-3 mt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-txt-secondary">Final Score</span>
                  <span className="font-mono text-xl font-bold">{bd?.FINAL_SCORE}</span>
                </div>
              </div>
            </Panel>

            {/* Timeline */}
            <Panel title="Decision Timeline" className="lg:col-span-1" testId="decision-timeline">
              <ol className="relative border-l border-white/10 ml-2 space-y-3">
                {run.timeline.map((t, i) => (
                  <li key={i} className="ml-4">
                    <div className={cn("absolute -left-1.5 w-3 h-3 rounded-full border-2 border-term-panel",
                      ["BUY", "BULLISH", "APPROVED", "PASS", "OK"].includes(String(t.decision).toUpperCase()) ? "bg-profit" :
                      ["SELL", "BEARISH", "REJECT", "BLOCK", "RR_INVALID"].includes(String(t.decision).toUpperCase()) ? "bg-loss" :
                      t.decision === "NO_TRADE" ? "bg-txt-muted" : "bg-info")} />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-txt-primary">{t.event}</span>
                      <span className="font-mono text-[11px] text-txt-muted">{t.time}</span>
                    </div>
                    <div className="text-xs text-txt-secondary">{t.detail}</div>
                  </li>
                ))}
              </ol>
            </Panel>

            {/* Signal */}
            <Panel title="Generated Signal" className="lg:col-span-1" testId="signal-panel">
              {run.signal_id ? (
                <div className="space-y-2 font-mono text-sm">
                  {[
                    ["Signal ID", run.signal_id],
                    ["Direction", dir],
                    ["Entry", run.agents.find(a => a.agent_id === "rr_optimizer")?.output?.entry],
                    ["Stop Loss", run.agents.find(a => a.agent_id === "rr_optimizer")?.output?.stop_loss],
                    ["Take Profit", run.agents.find(a => a.agent_id === "rr_optimizer")?.output?.take_profit],
                    ["Risk/Reward", run.agents.find(a => a.agent_id === "rr_optimizer")?.output?.risk_reward],
                    ["Confidence", run.confidence],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-white/5 pb-1.5">
                      <span className="text-txt-secondary">{k}</span>
                      <span className={cn(k === "Direction" && decisionColor(dir))}>{String(v)}</span>
                    </div>
                  ))}
                  <div className="pt-2 text-xs text-txt-muted">Signal stored. In LIVE mode it is served to the MT5 EA for execution.</div>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-txt-secondary">
                  No signal generated. The system requires full agent consensus, valid RR, and risk approval.
                </div>
              )}
            </Panel>
          </div>

          {/* Agent grid */}
          <Panel title="Agent Outputs" testId="agent-outputs">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {run.agents.map((a) => (
                <div key={a.agent_id} className="border border-white/10 rounded-sm p-3 bg-term-elevated/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{AGENT_LABELS[a.agent_id] || a.name}</span>
                    <span className="font-mono text-sm font-bold">{a.score}</span>
                  </div>
                  <StatusBadge value={a.decision} />
                  <div className="text-[11px] text-txt-secondary mt-2 leading-snug line-clamp-3">{a.reason}</div>
                  <div className="text-[10px] text-txt-muted mt-2 font-mono">{a.source} · {a.execution_time_ms}ms</div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
