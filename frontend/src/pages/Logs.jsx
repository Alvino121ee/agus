import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Panel, EmptyState } from "@/components/common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollText } from "lucide-react";

export default function Logs() {
  const [logs, setLogs] = useState(null);
  useEffect(() => { api.getLogs().then(setLogs); }, []);

  const render = (rows) => rows?.length ? (
    <div className="divide-y divide-white/5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-4 px-4 py-2.5 font-mono text-xs">
          <span className="text-txt-muted shrink-0">{r.created_at?.slice(11, 19)}</span>
          <span className="text-brand shrink-0 w-40 truncate">{r.type || r.signal_id || "—"}</span>
          <span className="text-txt-secondary flex-1 break-all">{JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !["created_at"].includes(k))))}</span>
        </div>
      ))}
    </div>
  ) : <EmptyState icon={ScrollText} title="No entries" />;

  return (
    <div className="space-y-6" data-testid="logs-page">
      <div>
        <h1 className="text-2xl font-bold">Logs & Audit Trail</h1>
        <p className="text-sm text-txt-secondary mt-1">Every important decision is timestamped and recorded</p>
      </div>
      <Tabs defaultValue="audit">
        <TabsList className="bg-term-panel border border-white/10">
          <TabsTrigger value="audit" data-testid="tab-audit">Audit</TabsTrigger>
          <TabsTrigger value="execution" data-testid="tab-execution">Execution</TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-risk">Risk Events</TabsTrigger>
        </TabsList>
        <TabsContent value="audit"><Panel className="p-0">{render(logs?.audit)}</Panel></TabsContent>
        <TabsContent value="execution"><Panel className="p-0">{render(logs?.execution)}</Panel></TabsContent>
        <TabsContent value="risk"><Panel className="p-0">{render(logs?.risk)}</Panel></TabsContent>
      </Tabs>
    </div>
  );
}
