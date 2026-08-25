import { useEffect, useState } from "react";
import api from "@/lib/api";
import { StatusBadge, Panel } from "@/components/common";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Circle, Loader2, Play } from "lucide-react";
import { SYMBOLS, TIMEFRAMES, selectClass } from "@/lib/constants";
import { toast } from "sonner";

export default function Agents() {
  const [data, setData] = useState(null);
  const [run, setRun] = useState(null);
  const [selected, setSelected] = useState(null);
  const [symbol, setSymbol] = useState("XAUUSD");
  const [tf, setTf] = useState("M15");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const d = await api.getAgents();
    setData(d);
    if (d.last_run_id) setRun(await api.getRun(d.last_run_id));
  };
  useEffect(() => { load(); }, []);

  const doRun = async () => {
    setLoading(true);
    try {
      const r = await api.runAnalysis({ symbol, timeframe: tf });
      setRun(r);
      await load();
      toast.success(`Pipeline complete: ${r.final_decision}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };

  const detail = selected && run ? run.agents.find((a) => a.agent_id === selected) : null;

  return (
    <div className="space-y-6" data-testid="agents-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Agent Control Center</h1>
          <p className="text-sm text-txt-secondary mt-1">10 specialised agents · consensus voting + veto</p>
        </div>
        <div className="flex items-center gap-2">
          <select className={selectClass} value={symbol} onChange={(e) => setSymbol(e.target.value)}>{SYMBOLS.map((s) => <option key={s}>{s}</option>)}</select>
          <select className={selectClass} value={tf} onChange={(e) => setTf(e.target.value)}>{TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}</select>
          <button data-testid="run-agents-btn" onClick={doRun} disabled={loading} className="flex items-center gap-2 bg-brand hover:bg-brand/85 text-white text-sm px-4 py-1.5 rounded-sm transition-colors duration-150 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run
          </button>
        </div>
      </div>

      <Panel testId="agents-table" className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-txt-secondary border-b border-white/10">
              <th className="text-left font-semibold px-4 py-3">Agent</th>
              <th className="text-left font-semibold px-4 py-3">Role</th>
              <th className="text-center font-semibold px-4 py-3">Status</th>
              <th className="text-right font-semibold px-4 py-3">Score</th>
              <th className="text-center font-semibold px-4 py-3">Decision</th>
              <th className="text-right font-semibold px-4 py-3">Time</th>
              <th className="text-right font-semibold px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {data?.agents.map((a) => (
              <tr key={a.agent_id} data-testid={`agent-row-${a.agent_id}`} onClick={() => setSelected(a.agent_id)}
                className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors duration-150">
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3 text-txt-secondary text-xs max-w-xs truncate">{a.role}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1.5 text-xs text-profit"><Circle className="w-2 h-2 fill-profit animate-pulse" /> Online</span>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold">{a.last_score ?? "—"}</td>
                <td className="px-4 py-3 text-center"><StatusBadge value={a.last_decision} /></td>
                <td className="px-4 py-3 text-right font-mono text-xs text-txt-secondary">{a.execution_time_ms != null ? `${a.execution_time_ms}ms` : "—"}</td>
                <td className="px-4 py-3 text-right font-mono text-[11px] text-txt-muted">{a.source || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="bg-term-panel border-white/10 text-txt-primary w-full sm:max-w-lg overflow-y-auto" data-testid="agent-detail-drawer">
          <SheetHeader>
            <SheetTitle className="text-txt-primary">{detail?.name}</SheetTitle>
          </SheetHeader>
          {detail ? (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Decision"><StatusBadge value={detail.decision} /></Field>
                <Field label="Score"><span className="font-mono font-bold text-lg">{detail.score}</span></Field>
                <Field label="Execution Time"><span className="font-mono">{detail.execution_time_ms}ms</span></Field>
                <Field label="Tokens"><span className="font-mono">{detail.tokens}</span></Field>
                <Field label="Source"><span className="font-mono text-xs">{detail.source}</span></Field>
                <Field label="Version"><span className="font-mono text-xs">{detail.version}</span></Field>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-txt-secondary mb-1">Reason (audit summary)</div>
                <div className="text-sm text-txt-primary bg-term-elevated/50 border border-white/10 rounded-sm p-3">{detail.reason}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-txt-secondary mb-1">Structured Output</div>
                <pre className="text-[11px] font-mono bg-term-bg border border-white/10 rounded-sm p-3 overflow-x-auto text-txt-secondary">{JSON.stringify(detail.output, null, 2)}</pre>
              </div>
            </div>
          ) : (
            <div className="mt-8 text-sm text-txt-secondary">Run the pipeline to populate this agent's latest output.</div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div className="bg-term-elevated/40 border border-white/10 rounded-sm p-3">
    <div className="text-[10px] uppercase tracking-wider text-txt-secondary mb-1">{label}</div>
    {children}
  </div>
);
