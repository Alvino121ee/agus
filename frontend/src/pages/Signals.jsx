import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Panel, StatusBadge, decisionColor, EmptyState } from "@/components/common";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Signals() {
  const [signals, setSignals] = useState([]);
  useEffect(() => { api.getSignals().then(setSignals); }, []);

  return (
    <div className="space-y-6" data-testid="signals-page">
      <div>
        <h1 className="text-2xl font-bold">Signals</h1>
        <p className="text-sm text-txt-secondary mt-1">Structured signals that passed every validation layer</p>
      </div>
      <Panel className="p-0">
        {signals.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-txt-secondary border-b border-white/10">
                {["Signal ID", "Symbol", "Dir", "Entry", "SL", "TP", "RR", "Conf", "Strategy", "Status"].map((h, i) => (
                  <th key={h} className={cn("px-4 py-3 font-semibold", i >= 3 && i <= 7 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s.signal_id} data-testid={`signal-row-${s.signal_id}`} className="border-b border-white/5 hover:bg-white/[0.02] font-mono">
                  <td className="px-4 py-3 text-[11px] text-txt-secondary">{s.signal_id}</td>
                  <td className="px-4 py-3">{s.symbol}<span className="text-txt-muted"> {s.timeframe}</span></td>
                  <td className={cn("px-4 py-3 font-bold", decisionColor(s.direction))}>{s.direction}</td>
                  <td className="px-4 py-3 text-right">{s.entry}</td>
                  <td className="px-4 py-3 text-right text-loss">{s.stop_loss}</td>
                  <td className="px-4 py-3 text-right text-profit">{s.take_profit}</td>
                  <td className="px-4 py-3 text-right">{s.risk_reward}</td>
                  <td className="px-4 py-3 text-right">{s.confidence}</td>
                  <td className="px-4 py-3 text-xs text-txt-secondary font-sans max-w-[160px] truncate">{s.strategy_name}</td>
                  <td className="px-4 py-3"><StatusBadge value={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={Radio} title="No signals yet" hint="Run the AI Analysis pipeline. Approved setups appear here." />}
      </Panel>
    </div>
  );
}
