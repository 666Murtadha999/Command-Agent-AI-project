import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuditEvent } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const KIND_COLORS: Record<string, string> = {
  user_message: "text-muted-foreground",
  agent_decision: "text-primary",
  tool_call: "text-accent",
  approval_request: "text-accent",
  approval_decision: "text-primary",
  execution: "text-primary",
  error: "text-destructive",
};

export function AuditPage() {
  const { data: events = [] } = useQuery<AuditEvent[]>({
    queryKey: ["/api/audit"],
    refetchInterval: 3000,
  });

  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const f = filter.toLowerCase().trim();
    if (!f) return events;
    return events.filter(
      (e) =>
        e.kind.toLowerCase().includes(f) ||
        e.summary.toLowerCase().includes(f) ||
        (e.detail ?? "").toLowerCase().includes(f)
    );
  }, [events, filter]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <header>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Audit</div>
          <h1 className="text-xl font-semibold tracking-tight">Activity log</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Every user message, agent decision, tool call, approval, execution, and error is
            recorded here. Newest first. Local-only.
          </p>
        </header>

        <Input
          data-testid="input-audit-filter"
          placeholder="Filter by kind, summary, or payload…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <Card className="p-0 overflow-hidden">
          <div className="font-mono text-xs">
            {filtered.length === 0 ? (
              <div className="p-4 text-muted-foreground">No events match.</div>
            ) : (
              filtered.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[160px_180px_1fr] gap-3 px-4 py-2 border-b border-border last:border-0"
                  data-testid={`audit-${e.id}`}
                >
                  <span className="text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                  <span className={cn("uppercase tracking-wider", KIND_COLORS[e.kind] ?? "")}>
                    {e.kind.replace(/_/g, " ")}
                  </span>
                  <div>
                    <div className="text-foreground">{e.summary}</div>
                    {e.detail && (
                      <details className="mt-1">
                        <summary className="text-muted-foreground cursor-pointer">detail</summary>
                        <pre className="mt-1 p-2 bg-muted/40 rounded overflow-x-auto whitespace-pre-wrap break-all">
                          {prettyJson(e.detail)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
