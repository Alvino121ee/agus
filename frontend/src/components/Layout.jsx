import { useEffect, useState, createContext, useContext } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard, Brain, Cpu, FlaskConical, LineChart, Radio, Wallet,
  History, Plug, ShieldAlert, Gauge, ScrollText, Settings as Cog, Power, XOctagon, Circle, CandlestickChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const SettingsCtx = createContext(null);
export const useAppSettings = () => useContext(SettingsCtx);

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/analysis", label: "AI Analysis", icon: Brain },
  { to: "/chart", label: "Chart", icon: CandlestickChart },
  { to: "/agents", label: "AI Agents", icon: Cpu },
  { to: "/strategy-lab", label: "Strategy Lab", icon: FlaskConical },
  { to: "/backtest", label: "Backtest", icon: LineChart },
  { to: "/signals", label: "Signals", icon: Radio },
  { to: "/positions", label: "Positions", icon: Wallet },
  { to: "/history", label: "Trade History", icon: History },
  { to: "/mt5", label: "MT5", icon: Plug },
  { to: "/risk", label: "Risk Management", icon: ShieldAlert },
  { to: "/performance", label: "Performance", icon: Gauge },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Cog },
];

const MODES = ["PAPER", "DEMO", "LIVE"];

export default function Layout() {
  const [settings, setSettings] = useState(null);
  const [ds, setDs] = useState(null);

  const refresh = async () => {
    const [s, d] = await Promise.all([api.getSettings(), api.deepseekStatus()]);
    setSettings(s); setDs(d);
  };
  useEffect(() => { refresh(); }, []);

  const setMode = async (mode) => {
    if (mode === "LIVE" && !window.confirm("Enable LIVE mode? Approved signals will be sent to your MT5 EA for real execution.")) return;
    const s = await api.updateSettings({ mode });
    setSettings(s);
    toast.success(`Mode set to ${mode}`);
  };

  const toggleStop = async () => {
    const next = !settings?.emergency_stop;
    await api.emergencyStop(next);
    await refresh();
    toast[next ? "error" : "success"](next ? "EMERGENCY STOP ACTIVATED" : "Emergency stop cleared");
  };

  const closeAll = async () => {
    const r = await api.closeAll();
    toast.success(`Closed ${r.closed} position(s)`);
    refresh();
  };

  return (
    <SettingsCtx.Provider value={{ settings, setSettings, refresh, ds }}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 bg-term-bg border-r border-white/10 flex flex-col fixed h-screen z-20">
          <div className="px-4 py-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-sm bg-brand/20 border border-brand/40 flex items-center justify-center">
                <Cpu className="w-4 h-4 text-brand" strokeWidth={1.5} />
              </div>
              <div>
                <div className="text-sm font-heading font-bold leading-none">NEXUS<span className="text-brand">AI</span></div>
                <div className="text-[10px] text-txt-muted tracking-wider">TRADING TERMINAL</div>
              </div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {NAV.map((n) => (
              <NavLink
                key={n.to} to={n.to} end={n.end}
                data-testid={`nav-${n.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-4 py-2 text-sm border-l-2 transition-colors duration-150",
                  isActive
                    ? "border-brand text-txt-primary bg-white/[0.03]"
                    : "border-transparent text-txt-secondary hover:text-txt-primary hover:bg-white/[0.02]"
                )}
              >
                <n.icon className="w-4 h-4" strokeWidth={1.5} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="px-4 py-3 border-t border-white/10 text-[10px] text-txt-muted">
            <div className="flex items-center gap-2">
              <Circle className={cn("w-2 h-2", ds?.connected ? "fill-profit text-profit animate-pulse" : "fill-warning text-warning")} />
              DeepSeek: {ds?.connected ? "LIVE" : "SIMULATION"}
            </div>
            <div className="mt-1 font-mono">{ds?.model}</div>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 ml-56 flex flex-col min-h-screen">
          {/* Topbar */}
          <header className="sticky top-0 z-10 bg-term-bg/95 backdrop-blur border-b border-white/10 px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-1 border border-white/10 rounded-sm p-0.5">
              {MODES.map((m) => (
                <button
                  key={m} onClick={() => setMode(m)}
                  data-testid={`mode-${m.toLowerCase()}`}
                  className={cn(
                    "px-3 py-1 text-xs font-mono font-medium rounded-sm transition-colors duration-150",
                    settings?.mode === m
                      ? (m === "LIVE" ? "bg-loss text-white" : m === "DEMO" ? "bg-warning text-black" : "bg-brand text-white")
                      : "text-txt-secondary hover:text-txt-primary"
                  )}
                >{m}</button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {settings?.emergency_stop && (
                <span className="text-xs font-mono text-loss border border-loss/40 bg-loss/10 px-2 py-1 rounded-sm animate-pulse">HALTED</span>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button data-testid="close-all-btn" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-white/15 rounded-sm text-txt-secondary hover:text-txt-primary hover:bg-white/5 transition-colors duration-150">
                    <XOctagon className="w-3.5 h-3.5" strokeWidth={1.5} /> Close All
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-term-panel border-white/10">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Close all open positions?</AlertDialogTitle>
                    <AlertDialogDescription>This closes every open position. Second confirmation required. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction data-testid="confirm-close-all" onClick={closeAll} className="bg-loss hover:bg-loss/80">Confirm Close All</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <button
                onClick={toggleStop}
                data-testid="emergency-stop"
                className={cn(
                  "flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-sm transition-colors duration-150 border",
                  settings?.emergency_stop
                    ? "bg-profit/15 border-profit/40 text-profit hover:bg-profit/25"
                    : "bg-loss border-loss text-white hover:bg-loss/85"
                )}
              >
                <Power className="w-3.5 h-3.5" strokeWidth={2} />
                {settings?.emergency_stop ? "RESUME" : "EMERGENCY STOP"}
              </button>
            </div>
          </header>

          <main className="flex-1 p-6 animate-fade-in">
            <Outlet />
          </main>

          <footer className="border-t border-white/10 px-6 py-3 text-[11px] text-txt-muted flex items-center justify-between">
            <span>⚠ AI does not guarantee profit. Backtests are not a guarantee of future results. Always test on PAPER/DEMO before LIVE.</span>
            <span className="font-mono">mode: {settings?.mode || "—"}</span>
          </footer>
        </div>
      </div>
    </SettingsCtx.Provider>
  );
}
