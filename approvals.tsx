import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ApprovalRequest } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ShieldCheck, ShieldX, Clock } from "lucide-react";
import { ApprovalModal } from "@/components/approval-modal";
import { cn } from "@/lib/utils";

export function ApprovalsPage() {
  const [open, setOpen] = useState<string | null>(null);
  const { data: approvals = [] } = useQuery<ApprovalRequest[]>({
    queryKey: ["/api/approvals"],
    refetchInterval: 3000,
  });

  const groups = {
    pending: approvals.filter((a) => a.status === "pending"),
    approved: approvals.filter((a) => a.status === "approved"),
    denied: approvals.filter((a) => a.status === "denied"),
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <header>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Approvals
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Execute-gate decisions
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Every consequential action — sending, publishing, deleting, paying, account changes,
            destructive shell — passes through this queue. Nothing executes until you decide.
          </p>
        </header>

        <Section title="Pending" icon={Clock} tone="accent">
          {groups.pending.length === 0 ? (
            <Empty>No pending approvals.</Empty>
          ) : (
            groups.pending.map((a) => <Row key={a.id} a={a} onOpen={() => setOpen(a.id)} />)
          )}
        </Section>

        <Section title="Approved" icon={ShieldCheck}>
          {groups.approved.length === 0 ? (
            <Empty>No approved actions yet.</Empty>
          ) : (
            groups.approved.slice(0, 20).map((a) => <Row key={a.id} a={a} onOpen={() => setOpen(a.id)} />)
          )}
        </Section>

        <Section title="Denied" icon={ShieldX}>
          {groups.denied.length === 0 ? (
            <Empty>No denied actions yet.</Empty>
          ) : (
            groups.denied.slice(0, 20).map((a) => <Row key={a.id} a={a} onOpen={() => setOpen(a.id)} />)
          )}
        </Section>
      </div>
      <ApprovalModal approvalId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: any;
  tone?: "accent";
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className={cn("w-3.5 h-3.5", tone === "accent" && "text-accent")} />
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-3 text-xs text-muted-foreground">{children}</Card>
  );
}

function Row({ a, onOpen }: { a: ApprovalRequest; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      data-testid={`row-approval-${a.id}`}
      className="w-full text-left"
    >
      <Card className="p-3 hover-elevate active-elevate-2 border">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-accent" />
              <span className="text-sm font-mono">{a.actionType}</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {a.riskLevel}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                {a.reversibility.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground line-clamp-2">{a.summary}</div>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase">{a.status}</div>
        </div>
      </Card>
    </button>
  );
}
