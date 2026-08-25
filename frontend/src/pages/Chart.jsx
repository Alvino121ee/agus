import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, CandlestickSeries, createSeriesMarkers } from "lightweight-charts";
import api from "@/lib/api";
import { Panel, StatusBadge, decisionColor, EmptyState } from "@/components/common";
import { TIMEFRAMES, selectClass } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Radio, Play, Loader2, CandlestickChart as ChartIcon } from "lucide-react";
import { toast } from "sonner";

const SYMBOL = "XAUUSD"; // Chart is focused only on XAUUSD signals

export default function Chart() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const markersRef = useRef(null);
  const priceLinesRef = useRef([]);
  const [tf, setTf] = useState("M15");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.getChart(SYMBOL, tf)); }
    finally { setLoading(false); }
  }, [tf]);

  useEffect(() => { load(); }, [load]);

  // init chart once
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: "#0B0E14" }, textColor: "#94A3B8", fontFamily: "JetBrains Mono, monospace" },
      localization: { locale: "en-US" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
      timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#10B981", downColor: "#EF4444", borderVisible: false,
      wickUpColor: "#10B981", wickDownColor: "#EF4444",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  // update data
  useEffect(() => {
    if (!seriesRef.current || !data) return;
    seriesRef.current.setData(data.bars);

    // markers
    const markers = data.signals.map((s) => ({
      time: s.time,
      position: s.direction === "BUY" ? "belowBar" : "aboveBar",
      color: s.direction === "BUY" ? "#10B981" : "#EF4444",
      shape: s.direction === "BUY" ? "arrowUp" : "arrowDown",
      text: `${s.direction} ${s.confidence}`,
    })).sort((a, b) => a.time - b.time);
    if (markersRef.current) markersRef.current.setMarkers(markers);
    else markersRef.current = createSeriesMarkers(seriesRef.current, markers);

    // price lines for the most recent signal
    priceLinesRef.current.forEach((l) => seriesRef.current.removePriceLine(l));
    priceLinesRef.current = [];
    const latest = data.signals[0];
    const lo = Math.min(...data.bars.map((b) => b.low));
    const hi = Math.max(...data.bars.map((b) => b.high));
    if (latest && latest.entry >= lo * 0.95 && latest.entry <= hi * 1.05) {
      const add = (price, color, title) => priceLinesRef.current.push(
        seriesRef.current.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title })
      );
      add(latest.entry, "#3B82F6", `ENTRY ${latest.direction}`);
      add(latest.stop_loss, "#EF4444", "SL");
      add(latest.take_profit, "#10B981", "TP");
    }
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  const runAnalysis = async () => {
    setRunning(true);
    try {
      const r = await api.runAnalysis({ symbol: SYMBOL, timeframe: tf });
      toast[r.signal_id ? "success" : "message"](r.signal_id ? `New signal: ${r.direction} @ conf ${r.confidence}` : `NO_TRADE · confidence ${r.confidence}`);
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setRunning(false); }
  };

  return (
    <div className="space-y-6" data-testid="chart-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ChartIcon className="w-6 h-6 text-brand" strokeWidth={1.5} /> XAUUSD Chart</h1>
          <p className="text-sm text-txt-secondary mt-1">Live candlestick with AI signal markers — focused only on XAUUSD</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold">{data?.last_price ?? "—"}</span>
          <select data-testid="chart-timeframe" className={selectClass} value={tf} onChange={(e) => setTf(e.target.value)}>
            {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button data-testid="chart-run-btn" onClick={runAnalysis} disabled={running}
            className="flex items-center gap-2 bg-brand hover:bg-brand/85 text-white text-sm px-4 py-1.5 rounded-sm transition-colors duration-150 disabled:opacity-60">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Analyze XAUUSD
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Panel className="lg:col-span-3 p-0 relative" testId="chart-panel">
          {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-term-panel/60"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>}
          <div ref={containerRef} data-testid="chart-canvas" className="w-full h-[520px]" />
        </Panel>

        <Panel title="XAUUSD Signals" className="p-0" testId="chart-signals">
          {data?.signals?.length ? (
            <div className="divide-y divide-white/5 max-h-[520px] overflow-y-auto">
              {data.signals.map((s) => (
                <div key={s.signal_id} data-testid={`chart-signal-${s.signal_id}`} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className={cn("font-mono font-bold", decisionColor(s.direction))}>{s.direction}</span>
                    <StatusBadge value={s.status} />
                  </div>
                  <div className="text-[10px] text-txt-muted font-mono mt-0.5">{s.signal_id}</div>
                  <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-[11px]">
                    <div><div className="text-txt-muted">Entry</div><div className="text-info">{s.entry}</div></div>
                    <div><div className="text-txt-muted">SL</div><div className="text-loss">{s.stop_loss}</div></div>
                    <div><div className="text-txt-muted">TP</div><div className="text-profit">{s.take_profit}</div></div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-txt-secondary">
                    <span>RR {s.risk_reward}</span><span>conf {s.confidence}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={Radio} title="No XAUUSD signals yet" hint="Click Analyze XAUUSD to run the 10-agent pipeline." />}
        </Panel>
      </div>
    </div>
  );
}
