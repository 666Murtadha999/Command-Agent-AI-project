import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, ShieldAlert, ShieldCheck, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = {
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  approvalRequired: boolean | "depends_on_command";
  privateDataAccess: boolean;
};

export function ToolsPage() {
  const { data: tools = [] } = useQuery<Tool[]>({ queryKey: ["/api/tools"] });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <header>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Tools</div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" /> Tool registry & permissions
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Each tool declares its risk level, approval requirement, and whether it can access
            private data. The orchestrator enforces these before executing.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tools.map((t) => (
            <Card key={t.name} className="p-3" data-testid={`tool-${t.name}`}>
              <div className="flex items-start justify-between mb-2">
                <span className="font-mono text-sm">{t.name}</span>
                <RiskBadge level={t.riskLevel} />
              </div>
              <div className="text-xs text-muted-foreground mb-2">{t.description}</div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
                {t.approvalRequired === true && (
                  <Badge variant="outline" className="text-accent border-accent-border">
                    <ShieldAlert className="w-3 h-3 mr-1" /> approval required
                  </Badge>
                )}
                {t.approvalRequired === false && (
                  <Badge variant="outline" className="text-primary border-primary-border">
                    <ShieldCheck className="w-3 h-3 mr-1" /> no approval
                  </Badge>
                )}
                {t.approvalRequired === "depends_on_command" && (
                  <Badge variant="outline" className="text-muted-foreground">
                    conditional
                  </Badge>
                )}
                {t.privateDataAccess && (
                  <Badge variant="outline" className="text-muted-foreground">
                    <EyeOff className="w-3 h-3 mr-1" /> private data
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-4 text-xs text-muted-foreground space-y-2">
          <div className="font-semibold text-foreground">Shell command policy</div>
          <p>
            Allowed without approval: <span className="font-mono">ls</span>,{" "}
            <span className="font-mono">pwd</span>, <span className="font-mono">grep</span>,{" "}
            <span className="font-mono">cat</span> on non-sensitive files; tests in a sandbox;
            formatters and linters on project files.
          </p>
          <p>
            Require approval: <span className="font-mono">rm</span>,{" "}
            <span className="font-mono">mv</span> overwriting files,{" "}
            <span className="font-mono">chmod</span>, <span className="font-mono">chown</span>,{" "}
            <span className="font-mono">sudo</span>, network scanning, exploit tools, credential
            access, data exfiltration, install scripts from unknown sources, system-setting
            changes.
          </p>
        </Card>
      </div>
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
