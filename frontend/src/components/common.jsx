import { cn } from "@/lib/utils";

export const decisionColor = (d) => {
  if (!d) return "text-txt-secondary";
  const s = String(d).toUpperCase();
  if (["BUY", "BULLISH", "APPROVED", "PASS", "AGREE", "OK", "LIVE", "ONLINE", "EXECUTED"].includes(s)) return "text-profit";
  if (["SELL", "BEARISH", "REJECT", "REJECTED", "BLOCKED", "RR_INVALID", "EXEC_FAILED"].includes(s)) return "text-loss";
  if (["WARNING", "WEAK", "NEUTRAL", "VALIDATING", "PAUSED"].includes(s)) return "text-warning";
  if (["NO_TRADE", "DRAFT", "BACKTESTING"].includes(s)) return "text-txt-secondary";
  return "text-info";
};

export const StatusBadge = ({ value, className }) => {
  const s = String(value || "").toUpperCase();
  const map = {
    profit: ["BUY", "BULLISH", "APPROVED", "PASS", "AGREE", "OK", "LIVE", "ONLINE", "EXECUTED"],
    loss: ["SELL", "BEARISH", "REJECT", "REJECTED", "BLOCKED", "RR_INVALID", "EXEC_FAILED", "OFFLINE"],
    warning: ["WARNING", "WEAK", "NEUTRAL", "VALIDATING", "PAUSED", "DEMO"],
    muted: ["NO_TRADE", "DRAFT", "BACKTESTING"],
  };
  let tone = "info";
  for (const [k, arr] of Object.entries(map)) if (arr.includes(s)) tone = k;
  const tones = {
    profit: "border-profit/40 text-profit bg-profit/10",
    loss: "border-loss/40 text-loss bg-loss/10",
    warning: "border-warning/40 text-warning bg-warning/10",
    muted: "border-white/15 text-txt-secondary bg-white/5",
    info: "border-info/40 text-info bg-info/10",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium tracking-wide border rounded-sm", tones[tone], className)}>
      {s || "—"}
    </span>
  );
};

export const Panel = ({ title, action, children, className, testId }) => (
  <div data-testid={testId} className={cn("bg-term-panel border border-white/10 rounded-sm", className)}>
    {title && (
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-xs uppercase tracking-wider text-txt-secondary font-semibold">{title}</h3>
        {action}
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
);

export const Stat = ({ label, value, sub, tone, testId }) => (
  <div data-testid={testId} className="bg-term-panel border border-white/10 rounded-sm p-4">
    <div className="text-[11px] uppercase tracking-wider text-txt-secondary">{label}</div>
    <div className={cn("mt-1 text-2xl font-mono font-bold tabular-nums", tone || "text-txt-primary")}>{value}</div>
    {sub && <div className="text-xs text-txt-secondary mt-1">{sub}</div>}
  </div>
);

export const EmptyState = ({ icon: Icon, title, hint }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {Icon && <Icon className="w-8 h-8 text-txt-muted mb-3" strokeWidth={1.5} />}
    <div className="text-sm text-txt-secondary">{title}</div>
    {hint && <div className="text-xs text-txt-muted mt-1 max-w-sm">{hint}</div>}
  </div>
);
