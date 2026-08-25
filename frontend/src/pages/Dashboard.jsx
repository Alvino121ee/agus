import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Stat, Panel, StatusBadge, decisionColor } from "@/components/common";
import { Activity, Radio, Ban, ShieldCheck, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const [perf, setPerf] = useState(null);
  const [runs, setRuns] = useState([]);
  const [signals, setSignals] = useState([]);
  const [mt5, setMt5] = useState(null);

  useEffect(() => {
    (async () => {
      const [p, r, s, m] = await Promise.all([api.getPerformance(), api.getRuns(), api.getSignals(), api.mt5Status()]);
      setPerf(p); setRuns(r.slice(0, 8)); setSignals(s.slice(0, 6)); setMt5(m);
    })();
  }, []);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-txt-secondary mt-1">AI Trading Research & Execution Platform · capital preservation first</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat testId="stat-runs" label="Pipeline Runs" value={perf?.runs ?? "—"} sub={`${perf?.no_trade_rate ?? 0}% ended NO_TRADE`} />
        <Stat testId="stat-signals" label="Signals Generated" value={perf?.signals ?? "—"} tone="text-info" />
        <Stat testId="stat-trades" label="Closed Trades" value={perf?.total_trades ?? 0} />
        <Stat testId="stat-netr" label="Net Result (R)" value={perf?.net_r ?? "0.00"} tone={cn((perf?.net_r ?? 0) >= 0 ? "text-profit" : "text-loss")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Recent Pipeline Runs" className="lg:col-span-2 p-0" testId="recent-runs"
          action={<Link to="/analysis" className="text-xs text-brand hover:underline flex items-center gap-1">Run analysis <ArrowRight className="w-3 h-3" /></Link>}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-txt-secondary border-b border-white/10">
                <th className="text-left px-4 py-2.5">Run</th><th className="text-left px-4 py-2.5">Symbol</th>
                <th className="text-center px-4 py-2.5">Decision</th><th className="text-right px-4 py-2.5">Conf</th>
                <th className="text-center px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.run_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-txt-secondary">{r.run_id}</td>
                  <td className="px-4 py-2.5 font-mono">{r.symbol} <span className="text-txt-muted">{r.timeframe}</span></td>
                  <td className={cn("px-4 py-2.5 text-center font-medium", decisionColor(r.final_decision))}>{r.final_decision}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.confidence}</td>
                  <td className="px-4 py-2.5 text-center"><StatusBadge value={r.status} /></td>
                </tr>
              ))}
              {runs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-txt-secondary text-sm">No runs yet.</td></tr>}
            </tbody>
          </table>
        </Panel>

        <div className="space-y-4">
          <Panel title="MT5 Connection" testId="mt5-mini">
            <div className="flex items-center justify-between">
              <span className="text-sm text-txt-secondary">Status</span>
              <StatusBadge value={mt5?.connection ? "ONLINE" : "OFFLINE"} />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-txt-secondary">Mode</span>
              <StatusBadge value={mt5?.mode} />
            </div>
            <Link to="/mt5" className="mt-3 inline-flex items-center gap-1 text-xs text-brand hover:underline">Configure EA <ArrowRight className="w-3 h-3" /></Link>
          </Panel>
          <Panel title="Latest Signals" className="p-0" testId="latest-signals">
            {signals.length ? signals.map((s) => (
              <div key={s.signal_id} className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                <div>
                  <div className="font-mono text-sm">{s.symbol} <span className={decisionColor(s.direction)}>{s.direction}</span></div>
                  <div className="text-[10px] text-txt-muted font-mono">{s.signal_id}</div>
                </div>
                <div className="text-right"><div className="font-mono text-sm">RR {s.risk_reward}</div><div className="text-[10px] text-txt-muted">conf {s.confidence}</div></div>
              </div>
            )) : <div className="px-4 py-8 text-center text-txt-secondary text-sm">No signals yet.</div>}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard icon={ShieldCheck} title="Capital Preservation" text="Independent Risk Engine can HARD REJECT any AI signal that breaches your limits." />
        <InfoCard icon={Ban} title="NO_TRADE by default" text="The system says NO_TRADE most of the time. It never forces trades or inflates RR." />
        <InfoCard icon={Activity} title="Cross-Agent Critique" text="A dedicated Critic attacks every setup. Weak confluence or unrealistic targets are rejected." />
      </div>
    </div>
  );
}

const InfoCard = ({ icon: Icon, title, text }) => (
  <div className="bg-term-panel border border-white/10 rounded-sm p-4">
    <Icon className="w-5 h-5 text-brand mb-2" strokeWidth={1.5} />
    <div className="text-sm font-medium">{title}</div>
    <div className="text-xs text-txt-secondary mt-1 leading-relaxed">{text}</div>
  </div>
);
