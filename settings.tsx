import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings as SettingsIcon, Moon, Sun, Cpu } from "lucide-react";

type Setting = { key: string; value: string; updatedAt: string };

const PROVIDERS = [
  { id: "mock", label: "Mock (default) — deterministic, no network" },
  { id: "ollama", label: "Ollama — local model at localhost:11434" },
  { id: "openai", label: "OpenAI (configure in server/agent/provider.ts)" },
  { id: "anthropic", label: "Anthropic (configure in server/agent/provider.ts)" },
];

const MEMORY_MODES = [
  { id: "manual", label: "Manual — ask before saving" },
  { id: "auto", label: "Auto — save low-risk stable preferences" },
  { id: "off", label: "Off — do not write to memory" },
];

export function SettingsPage() {
  const { data: settings = [] } = useQuery<Setting[]>({ queryKey: ["/api/settings"] });
  const map = useMemo(() => Object.fromEntries(settings.map((s) => [s.key, s.value])), [settings]);

  const [dark, setDark] = useState<boolean>(true);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const setSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await apiRequest("PUT", "/api/settings", { key, value });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings"] }),
  });

  const toggleDark = (v: boolean) => {
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
  };

  const provider = map.provider ?? "mock";
  const memoryMode = map.memory_mode ?? "manual";
  const approvalTimeoutMin = map.approval_timeout_min ?? "60";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <header>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Settings</div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-primary" /> Configuration
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Local-only settings. API keys belong in <span className="font-mono">.env</span>, not here.
          </p>
        </header>

        <Card className="p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5" /> Model provider
          </div>
          <Select
            value={provider}
            onValueChange={(v) => setSetting.mutate({ key: "provider", value: v })}
          >
            <SelectTrigger data-testid="select-provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">
            The provider adapter lives in{" "}
            <span className="font-mono">server/agent/provider.ts</span>. Implement the{" "}
            <span className="font-mono">LLMProvider</span> interface to add a real model. Set the{" "}
            <span className="font-mono">AGENT_PROVIDER</span> env var to switch at boot.
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Memory policy
          </div>
          <Select
            value={memoryMode}
            onValueChange={(v) => setSetting.mutate({ key: "memory_mode", value: v })}
          >
            <SelectTrigger data-testid="select-memory-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMORY_MODES.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">
            "remember that ..." messages auto-create memory entries in the current build. Toggle
            individual entries on the Memory page.
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Approval policy
          </div>
          <div className="flex items-center gap-2">
            <Input
              data-testid="input-approval-timeout"
              type="number"
              min={1}
              max={1440}
              value={approvalTimeoutMin}
              onChange={(e) =>
                setSetting.mutate({ key: "approval_timeout_min", value: e.target.value })
              }
              className="w-32"
            />
            <span className="text-xs text-muted-foreground">minutes before pending approvals are considered stale</span>
          </div>
          <div className="text-xs text-muted-foreground">
            The MVP does not auto-expire approvals; this value is wired into the UI for future
            enforcement.
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Appearance
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={dark} onCheckedChange={toggleDark} data-testid="switch-dark-mode" />
            <span className="text-sm flex items-center gap-2">
              {dark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              {dark ? "Dark (command-center)" : "Light"}
            </span>
          </div>
        </Card>

        <Card className="p-4 text-xs text-muted-foreground space-y-1">
          <div className="font-semibold text-foreground">Local data</div>
          <p>
            All conversations, memory, approvals, tool calls, and audit events are stored in{" "}
            <span className="font-mono">data.db</span> (SQLite + WAL) at the project root. Delete
            the file to reset.
          </p>
        </Card>
      </div>
    </div>
  );
}
