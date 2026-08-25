import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Panel, Stat } from "@/components/common";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export default function Performance() {
  const [p, setP] = useState(null);
  useEffect(() => { api.getPerformance().then(setP); }, []);
  const curve = (p?.equity_curve || []).map((v, i) => ({ i, r: v }));

  return (
    <div className="space-y-6" data-testid="performance-page">
      <div>
        <h1 className="text-2xl font-bold">Performance</h1>
        <p className="text-sm text-txt-secondary mt-1">Aggregate platform metrics · quality over quantity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Pipeline Runs" value={p?.runs ?? "—"} />
        <Stat label="NO_TRADE Rate" value={`${p?.no_trade_rate ?? 0}%`} sub="Discipline indicator" tone="text-info" />
        <Stat label="Signals" value={p?.signals ?? 0} />
        <Stat label="Closed Trades" value={p?.total_trades ?? 0} />
      </div>

      {p?.total_trades > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Win Rate" value={`${p.win_rate}%`} />
          <Stat label="Net (R)" value={p.net_r} tone={cn(p.net_r >= 0 ? "text-profit" : "text-loss")} />
          <Stat label="Avg (R)" value={p.avg_r} />
          <Stat label="Trades" value={p.total_trades} />
        </div>
      )}

      <Panel title="Cumulative R (closed trades)">
        {curve.length ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve}>
                <defs>
                  <linearGradient id="perf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="i" hide />
                <YAxis stroke="#475569" fontSize={11} width={36} />
                <Tooltip contentStyle={{ background: "#131722", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, fontFamily: "JetBrains Mono", fontSize: 12 }} />
                <Area type="monotone" dataKey="r" stroke="#10B981" strokeWidth={2} fill="url(#perf)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="py-12 text-center text-sm text-txt-secondary">No closed trades yet. Performance builds as trades close.</div>}
      </Panel>
    </div>
  );
}
