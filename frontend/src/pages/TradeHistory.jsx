import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Panel, decisionColor, EmptyState } from "@/components/common";
import { History, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function TradeHistory() {
  const [trades, setTrades] = useState([]);
  const [pm, setPm] = useState(null);
  const [loading, setLoading] = useState(null);

  useEffect(() => { api.getTrades().then(setTrades); }, []);

  const analyze = async (id) => {
    setLoading(id);
    try { setPm(await api.postmortem(id)); } catch { toast.error("Failed"); } finally { setLoading(null); }
  };

  return (
    <div className="space-y-6" data-testid="trade-history-page">
      <div>
        <h1 className="text-2xl font-bold">Trade History</h1>
        <p className="text-sm text-txt-secondary mt-1">Closed trades with AI post-mortem analysis</p>
      </div>
      <Panel className="p-0">
        {trades.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-txt-secondary border-b border-white/10">
                {["Trade", "Symbol", "Dir", "Entry", "Exit", "Result (R)", "Outcome", ""].map((h, i) => (
                  <th key={i} className={cn("px-4 py-3 font-semibold", i >= 3 && i <= 5 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.trade_id} className="border-b border-white/5 font-mono hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-[11px] text-txt-secondary">{t.trade_id}</td>
                  <td className="px-4 py-3">{t.symbol}</td>
                  <td className={cn("px-4 py-3 font-bold", decisionColor(t.direction))}>{t.direction}</td>
                  <td className="px-4 py-3 text-right">{t.entry}</td>
                  <td className="px-4 py-3 text-right">{t.exit}</td>
                  <td className={cn("px-4 py-3 text-right font-bold", (t.result_r ?? 0) >= 0 ? "text-profit" : "text-loss")}>{t.result_r}</td>
                  <td className="px-4 py-3 text-xs">{t.outcome}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => analyze(t.trade_id)} data-testid={`postmortem-${t.trade_id}`} className="text-xs text-brand hover:underline flex items-center gap-1 ml-auto">
                      {loading === t.trade_id ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Post-Mortem
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={History} title="No closed trades yet" hint="Trades appear after positions are closed." />}
      </Panel>

      <Dialog open={!!pm} onOpenChange={(o) => !o && setPm(null)}>
        <DialogContent className="bg-term-panel border-white/10 text-txt-primary" data-testid="postmortem-dialog">
          <DialogHeader><DialogTitle>Trade Post-Mortem · {pm?.trade_id}</DialogTitle></DialogHeader>
          {pm && (
            <div className="space-y-2 text-sm">
              {[["Entry quality", pm.entry_quality], ["SL assessment", pm.sl_assessment], ["TP assessment", pm.tp_assessment],
                ["Market change", pm.market_change], ["Execution timing", pm.execution_timing], ["Spread impact", pm.spread_impact],
                ["Improvement", pm.improvement]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-white/5 pb-1.5">
                  <span className="text-txt-secondary">{k}</span><span className="text-right">{v}</span>
                </div>
              ))}
              <p className="text-[11px] text-txt-muted pt-2">{pm.note}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
