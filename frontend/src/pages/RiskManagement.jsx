import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Panel } from "@/components/common";
import { selectClass } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ShieldAlert, Save } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [
  ["risk_per_trade_pct", "Risk per Trade (%)"],
  ["max_daily_loss_pct", "Max Daily Loss (%)"],
  ["max_weekly_loss_pct", "Max Weekly Loss (%)"],
  ["max_drawdown_pct", "Max Drawdown (%)"],
  ["max_open_positions", "Max Open Positions"],
  ["max_exposure_pct", "Max Exposure (%)"],
  ["max_lot", "Max Lot"],
  ["max_consecutive_losses", "Max Consecutive Losses"],
  ["min_rr", "Minimum RR"],
  ["confidence_threshold", "Confidence Threshold"],
];

export default function RiskManagement() {
  const [risk, setRisk] = useState(null);
  const [acc, setAcc] = useState(null);

  useEffect(() => { api.getSettings().then((s) => { setRisk(s.risk); setAcc(s.account); }); }, []);

  const save = async () => {
    const s = await api.updateSettings({ risk });
    setRisk(s.risk);
    toast.success("Risk limits saved");
  };

  if (!risk) return null;

  return (
    <div className="space-y-6" data-testid="risk-page">
      <div>
        <h1 className="text-2xl font-bold">Risk Management</h1>
        <p className="text-sm text-txt-secondary mt-1">The Risk Engine is independent of the AI and can HARD REJECT any signal</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Risk Limits" className="lg:col-span-2" testId="risk-form"
          action={<button data-testid="save-risk-btn" onClick={save} className="flex items-center gap-1.5 text-xs bg-brand hover:bg-brand/85 text-white px-3 py-1.5 rounded-sm transition-colors duration-150"><Save className="w-3.5 h-3.5" /> Save</button>}>
          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map(([k, label]) => (
              <label key={k} className="block text-xs text-txt-secondary">{label}
                <input type="number" step="0.1" data-testid={`risk-${k}`} className={cn(selectClass, "w-full mt-1")}
                  value={risk[k]} onChange={(e) => setRisk({ ...risk, [k]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Account State" testId="account-state">
            <div className="space-y-2 text-sm font-mono">
              {acc && [["Balance", acc.balance], ["Equity", acc.equity], ["Daily Loss %", acc.daily_loss_pct],
                ["Weekly Loss %", acc.weekly_loss_pct], ["Drawdown %", acc.drawdown_pct], ["Consec. Losses", acc.consecutive_losses]].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-white/5 pb-1.5">
                  <span className="text-txt-secondary font-sans">{k}</span><span>{v}</span>
                </div>
              ))}
            </div>
          </Panel>
          <div className="border border-brand/30 bg-brand/5 rounded-sm p-4">
            <ShieldAlert className="w-5 h-5 text-brand mb-2" strokeWidth={1.5} />
            <p className="text-xs text-txt-secondary leading-relaxed">Confidence high ≠ higher risk. The AI can never increase risk based on confidence. All position sizing stays inside these limits.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
