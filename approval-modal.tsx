import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ApprovalRequest } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";

export function ApprovalModal({
  approvalId,
  onClose,
}: {
  approvalId: string | null;
  onClose: () => void;
}) {
  const { data: approval } = useQuery<ApprovalRequest>({
    queryKey: ["/api/approvals", approvalId],
    enabled: !!approvalId,
    refetchInterval: 0,
    staleTime: 0,
  });

  const decision = useMutation({
    mutationFn: async (decision: "approved" | "denied") => {
      if (!approvalId) throw new Error("no approval id");
      const res = await apiRequest("POST", `/api/approvals/${approvalId}/decision`, { decision });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit"] });
      if (approval?.conversationId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/conversations", approval.conversationId, "messages"],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/conversations", approval.conversationId, "tool-calls"],
        });
      }
      onClose();
    },
  });

  const payload = useMemo(() => {
    if (!approval?.finalPayload) return null;
    try {
      return JSON.parse(approval.finalPayload);
    } catch {
      return approval.finalPayload;
    }
  }, [approval?.finalPayload]);

  const open = !!approvalId;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl" data-testid="dialog-approval">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-accent" />
            <DialogTitle className="text-base">Approval required</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Review the exact action below. The agent will not execute until you approve.
          </DialogDescription>
        </DialogHeader>

        {!approval ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            <Field label="Action">
              <span className="font-mono text-sm">{approval.actionType}</span>
            </Field>
            <Field label="Summary">
              <span className="text-sm">{approval.summary}</span>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Risk">
                <RiskBadge level={approval.riskLevel as any} />
              </Field>
              <Field label="Reversibility">
                <span className="text-xs font-mono">{approval.reversibility.replace(/_/g, " ")}</span>
              </Field>
              <Field label="Status">
                <span className="text-xs font-mono uppercase">{approval.status}</span>
              </Field>
            </div>
            {approval.rationale && (
              <Field label="Rationale">
                <span className="text-xs text-muted-foreground">{approval.rationale}</span>
              </Field>
            )}
            <Field label="Final payload">
              <pre className="text-xs font-mono bg-muted/40 border border-border rounded-md p-3 overflow-x-auto max-h-56">
                {typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}
              </pre>
            </Field>
            <Field label="Expected effect">
              <span className="text-xs text-muted-foreground">
                {expectedEffect(approval.actionType, approval.reversibility)}
              </span>
            </Field>
            <div className="text-[11px] text-muted-foreground border-l-2 border-accent pl-3">
              MVP simulation: approving runs a mock tool call only — no real external side
              effects are performed. Wire the tool router in <span className="font-mono">server/agent/orchestrator.ts</span> to enable real execution.
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            data-testid="button-deny"
            variant="outline"
            onClick={() => decision.mutate("denied")}
            disabled={!approval || approval.status !== "pending" || decision.isPending}
          >
            <ShieldX className="w-4 h-4 mr-2" /> Deny
          </Button>
          <Button
            data-testid="button-approve"
            onClick={() => decision.mutate("approved")}
            disabled={!approval || approval.status !== "pending" || decision.isPending}
          >
            <ShieldCheck className="w-4 h-4 mr-2" /> Approve & execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function RiskBadge({ level }: { level: "low" | "medium" | "high" | "critical" }) {
  const styles: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-accent/15 text-accent border-accent-border",
    high: "bg-destructive/15 text-destructive border-destructive-border",
    critical: "bg-destructive text-destructive-foreground border-destructive-border",
  };
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", styles[level])}>
      {level}
    </Badge>
  );
}

function expectedEffect(action: string, rev: string): string {
  const reversibilityNote =
    rev === "irreversible"
      ? "Not reversible after execution."
      : rev === "partially_reversible"
        ? "Partially reversible; some effects may persist."
        : "Reversible if needed.";
  const actionMap: Record<string, string> = {
    send_email: "Would send an email from a connected account.",
    publish_content: "Would publish content to a public surface.",
    delete_data: "Would delete data from a target store.",
    financial_transaction: "Would move funds or make a purchase.",
    account_change: "Would modify account settings or credentials.",
    privileged_shell: "Would run a privileged shell command on the host.",
    recurring_task: "Would create or enable a recurring scheduled task.",
    deploy_or_merge: "Would deploy to production or merge a branch.",
    generic_execute: "Would perform the requested external action.",
  };
  return `${actionMap[action] ?? "Would perform the requested action."} ${reversibilityNote}`;
}
