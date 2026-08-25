import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Panel, StatusBadge } from "@/components/common";
import { selectClass } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Save, Circle } from "lucide-react";
import { toast } from "sonner";

const NEWS_POLICIES = ["ALLOW_TRADING", "BLOCK_BEFORE_NEWS", "BLOCK_AFTER_NEWS"];

export default function Settings() {
  const [s, setS] = useState(null);
  const [ds, setDs] = useState(null);

  useEffect(() => {
    api.getSettings().then(setS);
    api.deepseekStatus().then(setDs);
  }, []);

  const saveNews = async (patch) => {
    const nf = { ...s.news_filter, ...patch };
    const r = await api.updateSettings({ news_filter: nf });
    setS(r); toast.success("News filter updated");
  };

  const saveAccount = async () => {
    const r = await api.updateSettings({ account: s.account });
    setS(r); toast.success("Account saved");
  };

  if (!s) return null;

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-txt-secondary mt-1">DeepSeek engine, news filter, and account configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="DeepSeek AI Engine" testId="deepseek-settings">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-txt-secondary">Connection</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                <Circle className={cn("w-2 h-2", ds?.connected ? "fill-profit text-profit" : "fill-warning text-warning")} />
                {ds?.connected ? "LIVE AI" : "SIMULATION"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 pb-2"><span className="text-txt-secondary">Model</span><span className="font-mono text-xs">{ds?.model}</span></div>
            <div className="flex items-center justify-between border-b border-white/5 pb-2"><span className="text-txt-secondary">Endpoint</span><span className="font-mono text-xs">{ds?.base_url}</span></div>
            <p className="text-[11px] text-txt-muted pt-1">
              The API key lives only in the backend (<span className="font-mono">DEEPSEEK_API_KEY</span>) and is never exposed to the browser. Set <span className="font-mono">DEEPSEEK_MODEL</span> to switch models. Until a key is added, agents run in deterministic simulation.
            </p>
          </div>
        </Panel>

        <Panel title="News / Market Event Filter" testId="news-settings">
          <div className="space-y-3">
            <label className="flex items-center justify-between text-sm">
              <span className="text-txt-secondary">Enable filter</span>
              <input type="checkbox" data-testid="news-enabled" checked={s.news_filter?.enabled} onChange={(e) => saveNews({ enabled: e.target.checked })} className="accent-brand w-4 h-4" />
            </label>
            <label className="block text-xs text-txt-secondary">Policy
              <select className={cn(selectClass, "w-full mt-1")} value={s.news_filter?.policy} onChange={(e) => saveNews({ policy: e.target.value })}>
                {NEWS_POLICIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <p className="text-[11px] text-txt-muted">If a news data feed is not connected, the system does not fabricate event data — it simply applies your chosen policy when data is available.</p>
          </div>
        </Panel>

        <Panel title="Account (paper)" testId="account-settings"
          action={<button onClick={saveAccount} className="flex items-center gap-1.5 text-xs bg-brand hover:bg-brand/85 text-white px-3 py-1.5 rounded-sm transition-colors duration-150"><Save className="w-3.5 h-3.5" /> Save</button>}>
          <div className="grid grid-cols-2 gap-3">
            {["balance", "equity", "daily_loss_pct", "weekly_loss_pct", "drawdown_pct", "consecutive_losses"].map((k) => (
              <label key={k} className="block text-xs text-txt-secondary">{k}
                <input type="number" className={cn(selectClass, "w-full mt-1")} value={s.account?.[k] ?? 0} onChange={(e) => setS({ ...s, account: { ...s.account, [k]: Number(e.target.value) } })} />
              </label>
            ))}
          </div>
        </Panel>

        <Panel title="Trading Mode" testId="mode-settings">
          <div className="flex items-center gap-3">
            <span className="text-sm text-txt-secondary">Current mode</span>
            <StatusBadge value={s.mode} />
          </div>
          <p className="text-[11px] text-txt-muted mt-3">Change the mode from the top bar. Default is <span className="text-txt-primary">PAPER</span>. LIVE requires explicit confirmation and only then are signals pushed to the MT5 EA.</p>
        </Panel>
      </div>
    </div>
  );
}
