import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Panel, StatusBadge } from "@/components/common";
import { Plug, Download, Circle, Copy } from "lucide-react";
import { toast } from "sonner";

export default function MT5() {
  const [status, setStatus] = useState(null);
  useEffect(() => { api.mt5Status().then(setStatus); }, []);
  const conn = status?.connection;

  return (
    <div className="space-y-6" data-testid="mt5-page">
      <div>
        <h1 className="text-2xl font-bold">MT5 EA Integration</h1>
        <p className="text-sm text-txt-secondary mt-1">Backend ↔ Secure Trading API ↔ MT5 EA ↔ Terminal ↔ Broker</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Connection Status" testId="mt5-connection">
          <div className="space-y-3 text-sm">
            <Row label="EA Link"><span className="inline-flex items-center gap-1.5"><Circle className={`w-2 h-2 ${conn ? "fill-profit text-profit animate-pulse" : "fill-loss text-loss"}`} />{conn ? "ONLINE" : "OFFLINE"}</span></Row>
            <Row label="Mode"><StatusBadge value={status?.mode} /></Row>
            <Row label="Emergency Stop"><StatusBadge value={status?.emergency_stop ? "BLOCKED" : "OK"} /></Row>
            <Row label="Secret Configured"><StatusBadge value={status?.secret_configured ? "OK" : "REJECTED"} /></Row>
            {conn && <>
              <Row label="Connection ID"><span className="font-mono text-xs">{conn.connection_id}</span></Row>
              <Row label="Balance"><span className="font-mono">{conn.balance ?? "—"}</span></Row>
              <Row label="Equity"><span className="font-mono">{conn.equity ?? "—"}</span></Row>
              <Row label="Open Positions"><span className="font-mono">{conn.open_positions ?? 0}</span></Row>
              <Row label="Last Heartbeat"><span className="font-mono text-xs">{conn.last_heartbeat}</span></Row>
            </>}
          </div>
        </Panel>

        <Panel title="Expert Advisor Setup" testId="mt5-setup">
          <ol className="text-sm text-txt-secondary space-y-2 list-decimal list-inside">
            <li>Download the EA file and open it in MetaEditor (MT5).</li>
            <li>Set <span className="font-mono text-txt-primary">ApiBaseUrl</span> to this backend URL and <span className="font-mono text-txt-primary">EaToken</span> to your <span className="font-mono">MT5_API_SECRET</span>.</li>
            <li>In MT5: Tools → Options → Expert Advisors → allow WebRequest for the backend URL.</li>
            <li>Attach the EA to a chart and enable AutoTrading.</li>
            <li>The EA polls <span className="font-mono text-txt-primary">/api/mt5/signals/pending</span> — signals are only pushed in <span className="text-profit">LIVE</span> mode.</li>
          </ol>
          <div className="flex gap-2 mt-4">
            <a href={api.eaFileUrl} download="AITradingBridge.mq5" data-testid="download-ea"
              className="flex items-center gap-2 bg-brand hover:bg-brand/85 text-white text-sm px-4 py-2 rounded-sm transition-colors duration-150">
              <Download className="w-4 h-4" /> Download EA (.mq5)
            </a>
            <button onClick={() => { navigator.clipboard.writeText(api.eaFileUrl.replace("/mt5/ea-file", "")); toast.success("API base copied"); }}
              className="flex items-center gap-2 border border-white/15 text-txt-secondary hover:text-txt-primary hover:bg-white/5 text-sm px-4 py-2 rounded-sm transition-colors duration-150">
              <Copy className="w-4 h-4" /> Copy API Base
            </button>
          </div>
          <p className="text-[11px] text-txt-muted mt-3">The EA validates signal ID, token, symbol, lot, SL/TP and executed-state before placing any order. Execution safety layers: AI → Signal Validator → Risk Engine → Execution Validator → EA Validator.</p>
        </Panel>
      </div>
    </div>
  );
}

const Row = ({ label, children }) => (
  <div className="flex items-center justify-between border-b border-white/5 pb-2">
    <span className="text-txt-secondary">{label}</span>{children}
  </div>
);
