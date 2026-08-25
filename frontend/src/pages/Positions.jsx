import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Panel, decisionColor, EmptyState } from "@/components/common";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Positions() {
  const [pos, setPos] = useState([]);
  useEffect(() => { api.getPositions().then(setPos); }, []);
  return (
    <div className="space-y-6" data-testid="positions-page">
      <div>
        <h1 className="text-2xl font-bold">Open Positions</h1>
        <p className="text-sm text-txt-secondary mt-1">Live positions synchronised from the MT5 EA</p>
      </div>
      <Panel className="p-0">
        {pos.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-txt-secondary border-b border-white/10">
                {["Position", "Symbol", "Dir", "Entry", "SL", "TP", "Ticket", "Status"].map((h, i) => (
                  <th key={h} className={cn("px-4 py-3 font-semibold", i >= 3 && i <= 6 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pos.map((p) => (
                <tr key={p.position_id} className="border-b border-white/5 font-mono hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-[11px] text-txt-secondary">{p.position_id}</td>
                  <td className="px-4 py-3">{p.symbol}</td>
                  <td className={cn("px-4 py-3 font-bold", decisionColor(p.direction))}>{p.direction}</td>
                  <td className="px-4 py-3 text-right">{p.entry}</td>
                  <td className="px-4 py-3 text-right text-loss">{p.stop_loss}</td>
                  <td className="px-4 py-3 text-right text-profit">{p.take_profit}</td>
                  <td className="px-4 py-3 text-right">{p.ticket || "—"}</td>
                  <td className="px-4 py-3 text-profit">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={Wallet} title="No open positions" hint="Positions appear when the EA executes a LIVE signal." />}
      </Panel>
    </div>
  );
}
