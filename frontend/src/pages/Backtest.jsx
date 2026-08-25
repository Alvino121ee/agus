import { useState } from "react";
import api from "@/lib/api";
import { Panel, StatusBadge } from "@/components/common";
import { SYMBOLS, TIMEFRAMES, selectClass } from "@/lib/constants";
import { Loader2, Play, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function Backtest() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [tf, setTf] = useState("M15");
  const [minRr, setMinRr] = useState(2.0);
  const [bias, setBias] = useState("BOTH");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);

  const run = async () => {
    setLoading(true);
    try {
      const r = await api.runBacktest({ symbol, timeframe: tf, min_rr: Number(minRr), direction_bias: bias });
      setRes(r);
      toast.success(`Backtest ${r.status} · ${r.full.total_trades} trades`);
    } catch (e) { toast.error("Backtest failed"); } finally { setLoading(false); }
  };

  const f = res?.full;
  const curve = (f?.equity_curve || []).map((v, i) => ({ i, r: v }));

  return (
    <div className="space-y-6" data-testid="backtest-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Backtest Engine</h1>
          <p className="text-sm text-txt-secondary mt-1">In-sample / out-of-sample · expectancy · profit factor · drawdown · Sharpe/Sortino</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className={selectClass} value={symbol} onChange={(e) => setSymbol(e.target.value)}>{SYMBOLS.map((s) => <option key={s}>{s}</option>)}</select>
          <select className={selectClass} value={tf} onChange={(e) => setTf(e.target.value)}>{TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}</select>
          <select className={selectClass} value={bias} onChange={(e) => setBias(e.target.value)}>{["BOTH", "LONG", "SHORT"].map((b) => <option key={b}>{b}</option>)}</select>
          <input type="number" step="0.1" className={cn(selectClass, "w-20")} value={minRr} onChange={(e) => setMinRr(e.target.value)} />
          <button data-testid="run-backtest-btn" onClick={run} disabled={loading} className="flex items-center gap-2 bg-brand hover:bg-brand/85 text-white text-sm px-4 py-1.5 rounded-sm transition-colors duration-150 disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run
          </button>
        </div>
      </div>

      {!res ? (
        <Panel><div className="py-12 text-center text-sm text-txt-secondary">Run a backtest to view full statistics and the equity curve.</div></Panel>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <StatusBadge value={res.status} />
            {res.overfit_flag && <span className="flex items-center gap-1.5 text-xs text-loss"><AlertTriangle className="w-4 h-4" /> Overfit: {res.overfit_reasons.join("; ")}</span>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              ["Total Trades", f.total_trades], ["Win Rate", `${f.win_rate}%`], ["Profit Factor", f.profit_factor],
              ["Net (R)", f.net_profit_r], ["Expectancy", `${f.expectancy}R`], ["Avg R", f.avg_r],
              ["Avg Win", f.avg_win], ["Avg Loss", f.avg_loss], ["Max DD (R)", f.max_drawdown_r],
              ["Sharpe", f.sharpe], ["Sortino", f.sortino], ["Max Cons. Loss", f.max_consecutive_losses],
            ].map(([l, v]) => (
              <div key={l} className="bg-term-panel border border-white/10 rounded-sm p-3">
                <div className="text-[10px] uppercase tracking-wider text-txt-secondary">{l}</div>
                <div className="font-mono font-bold mt-1">{v ?? "—"}</div>
              </div>
            ))}
          </div>

          <Panel title="Equity Curve (cumulative R)" testId="equity-curve">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve}>
                  <defs>
                    <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis stroke="#475569" fontSize={11} width={36} />
                  <Tooltip contentStyle={{ background: "#131722", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, fontFamily: "JetBrains Mono", fontSize: 12 }} />
                  <Area type="monotone" dataKey="r" stroke="#6366F1" strokeWidth={2} fill="url(#eq)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-3">
            {[["In-Sample", res.in_sample], ["Out-of-Sample", res.out_of_sample]].map(([t, d]) => (
              <Panel key={t} title={t}>
                <div className="font-mono text-sm text-txt-secondary space-y-1">
                  <div>trades: <span className="text-txt-primary">{d?.total_trades}</span></div>
                  <div>win rate: <span className="text-txt-primary">{d?.win_rate}%</span></div>
                  <div>profit factor: <span className="text-txt-primary">{d?.profit_factor}</span></div>
                  <div>expectancy: <span className={d?.expectancy > 0 ? "text-profit" : "text-loss"}>{d?.expectancy}R</span></div>
                </div>
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
