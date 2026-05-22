import { useState, useRef, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type {
  Conversation,
  Message,
  Task,
  ApprovalRequest,
  ToolCall,
  AgentMode,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Brain,
  PenLine,
  PackageOpen,
  PlayCircle,
  ArrowUp,
  CircleDot,
  CircleCheck,
  CircleAlert,
  Loader2,
  ShieldAlert,
  Cpu,
  Lightbulb,
  Code,
  BookOpen,
  ListTodo,
  Search,
} from "lucide-react";
import { ApprovalModal } from "@/components/approval-modal";
import { cn } from "@/lib/utils";
import { MarkdownLite } from "@/components/markdown-lite";

type ModeId = AgentMode | "auto";

const MODE_OPTIONS: { id: ModeId; label: string; icon: any; desc: string }[] = [
  { id: "auto", label: "Auto", icon: Cpu, desc: "Classify mode from intent" },
  { id: "think", label: "Think", icon: Brain, desc: "Analyze, critique, compare" },
  { id: "draft", label: "Draft", icon: PenLine, desc: "Write artifacts for review" },
  { id: "prepare", label: "Prepare", icon: PackageOpen, desc: "Stage context, no side effects" },
  { id: "execute", label: "Execute", icon: PlayCircle, desc: "Run action (gated by approval)" },
];

const EXAMPLE_PROMPTS: { icon: any; label: string; text: string }[] = [
  { icon: Lightbulb, label: "Critique an idea", text: "I want to quit my job tomorrow and launch an app in a week. Tell me directly whether this is weak." },
  { icon: ListTodo, label: "Plan a project", text: "Break down a plan to ship a personal portfolio site in two weekends." },
  { icon: PenLine, label: "Draft an email", text: "Draft an email to my professor asking for a one-week extension on the final project." },
  { icon: Code, label: "Coding help", text: "Explain how to debounce a React input and write a hook for it." },
  { icon: BookOpen, label: "Study plan", text: "Build a 4-week study plan for AWS Solutions Architect Associate." },
  { icon: Search, label: "Research", text: "Compare SQLite vs Postgres for a local-first desktop app." },
];

export function ChatPage() {
  const params = useParams();
  const conversationId = params.id;

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ModeId>("auto");
  const [openApprovalId, setOpenApprovalId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
    enabled: !!conversationId,
    refetchInterval: false,
    staleTime: 0,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/conversations", conversationId, "tasks"],
    enabled: !!conversationId,
    refetchInterval: 4000,
  });

  const { data: toolCalls = [] } = useQuery<ToolCall[]>({
    queryKey: ["/api/conversations", conversationId, "tool-calls"],
    enabled: !!conversationId,
    refetchInterval: 4000,
  });

  const { data: approvals = [] } = useQuery<ApprovalRequest[]>({
    queryKey: ["/api/approvals"],
    refetchInterval: 3000,
  });

  const conversationApprovals = useMemo(
    () => approvals.filter((a) => a.conversationId === conversationId),
    [approvals, conversationId]
  );

  const sendMutation = useMutation({
    mutationFn: async (payload: { content: string; mode?: AgentMode }) => {
      const body: any = { content: payload.content };
      if (conversationId) body.conversationId = conversationId;
      if (payload.mode) body.mode = payload.mode;
      const res = await apiRequest("POST", "/api/chat", body);
      return res.json() as Promise<{
        conversation: Conversation;
        userMessage: Message;
        assistantMessage: Message;
        approval?: ApprovalRequest;
      }>;
    },
    onSuccess: (data) => {
      // Navigate to created conversation if we didn't have one
      if (!conversationId) {
        window.location.hash = `#/c/${data.conversation.id}`;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/conversations", data.conversation.id, "messages"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/conversations", data.conversation.id, "tasks"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit"] });
      if (data.approval) {
        setOpenApprovalId(data.approval.id);
      }
    },
  });

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate({
      content: text,
      mode: mode === "auto" ? undefined : (mode as AgentMode),
    });
  };

  const status: { label: string; tone: "idle" | "thinking" | "approval" | "blocked" } = (() => {
    if (sendMutation.isPending) return { label: "Thinking…", tone: "thinking" };
    const pending = conversationApprovals.find((a) => a.status === "pending");
    if (pending) return { label: "Waiting for approval", tone: "approval" };
    return { label: "Ready", tone: "idle" };
  })();

  return (
    <div className="flex-1 min-w-0 min-h-0 flex">
      {/* Center: chat */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col border-r border-border">
        <header className="h-14 px-5 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "status-dot",
                status.tone === "idle" && "text-primary",
                status.tone === "thinking" && "text-accent",
                status.tone === "approval" && "text-accent",
                status.tone === "blocked" && "text-destructive"
              )}
            />
            <span className="text-sm font-medium" data-testid="text-status">
              {status.label}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {conversationId ? `conv: ${conversationId.slice(0, 8)}` : "no conversation"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Mode: <span className="font-mono">{mode}</span>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-6 space-y-4 scroll-smooth">
          {!conversationId && messages.length === 0 && (
            <EmptyState onPick={(t) => setInput(t)} />
          )}
          {messagesLoading && (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onOpenApproval={(id) => setOpenApprovalId(id)}
            />
          ))}
          {sendMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Classifying intent · selecting mode · drafting reply</span>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-5 py-4 space-y-2 bg-card">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                data-testid={`button-mode-${m.id}`}
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border hover-elevate active-elevate-2",
                  mode === m.id && "border-primary-border bg-primary/10 text-primary"
                )}
                title={m.desc}
              >
                <m.icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              data-testid="input-message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask, plan, draft, or request an action. Cmd/Ctrl+Enter to send."
              className="min-h-[64px] max-h-48 resize-none font-mono text-sm"
            />
            <Button
              data-testid="button-send"
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
              size="icon"
              className="h-10 w-10"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Drafts and previews require no approval. Execute-class actions are gated.
          </div>
        </div>
      </div>

      {/* Right: task / approval / tool activity */}
      <aside className="hidden lg:flex w-80 shrink-0 min-h-0 flex-col bg-sidebar">
        <RightPanel
          conversationId={conversationId}
          tasks={tasks}
          approvals={conversationApprovals}
          toolCalls={toolCalls}
          onOpenApproval={(id) => setOpenApprovalId(id)}
        />
      </aside>

      <ApprovalModal
        approvalId={openApprovalId}
        onClose={() => setOpenApprovalId(null)}
      />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="max-w-2xl mx-auto pt-8 space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
          Command Agent
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-glow-primary">
          Direct, practical, approval-gated.
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          I help you think, plan, research, code, write, study, and decide. I don't flatter, and I
          don't execute consequential actions without explicit approval. Start with a real task.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p.label}
            data-testid={`button-example-${p.label.replace(/\s+/g, "-").toLowerCase()}`}
            onClick={() => onPick(p.text)}
            className="text-left border border-border rounded-md p-3 hover-elevate active-elevate-2"
          >
            <div className="flex items-center gap-2 text-xs font-medium mb-1">
              <p.icon className="w-3.5 h-3.5 text-primary" />
              {p.label}
            </div>
            <div className="text-xs text-muted-foreground line-clamp-2">{p.text}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onOpenApproval,
}: {
  message: Message;
  onOpenApproval: (id: string) => void;
}) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const meta = useMemo(() => {
    if (!message.metadata) return null;
    try {
      return JSON.parse(message.metadata);
    } catch {
      return null;
    }
  }, [message.metadata]);

  const approvalId: string | undefined = meta?.approvalId;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        isUser ? "items-end" : "items-start"
      )}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>{isUser ? "you" : isTool ? "tool" : "agent"}</span>
        {message.mode && (
          <span className="font-mono text-primary">· {message.mode}</span>
        )}
        {meta?.refused && (
          <span className="font-mono text-destructive">· refused</span>
        )}
      </div>
      <Card
        className={cn(
          "max-w-[85%] p-3.5 border",
          isUser && "bg-primary/10 border-primary-border",
          isTool && "bg-accent/10 border-accent-border font-mono text-xs",
          !isUser && !isTool && "bg-card"
        )}
        data-testid={`message-${message.id}`}
      >
        <MarkdownLite text={message.content} />
        {approvalId && (
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-accent" />
            <Button
              data-testid={`button-open-approval-${approvalId}`}
              size="sm"
              variant="outline"
              onClick={() => onOpenApproval(approvalId)}
            >
              Open approval request
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function RightPanel({
  conversationId,
  tasks,
  approvals,
  toolCalls,
  onOpenApproval,
}: {
  conversationId?: string;
  tasks: Task[];
  approvals: ApprovalRequest[];
  toolCalls: ToolCall[];
  onOpenApproval: (id: string) => void;
}) {
  const pending = approvals.filter((a) => a.status === "pending");
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <Section title="Active plan" subtitle={`${tasks.length} steps`}>
        {tasks.length === 0 ? (
          <Empty>No plan yet. Ask for a plan or steps to create one.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Approvals"
        subtitle={`${pending.length} pending`}
        tone={pending.length > 0 ? "accent" : undefined}
      >
        {approvals.length === 0 ? (
          <Empty>No approval requests for this conversation.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {approvals.slice(0, 6).map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => onOpenApproval(a.id)}
                  data-testid={`button-approval-${a.id}`}
                  className="w-full text-left border border-border rounded-md p-2.5 hover-elevate active-elevate-2"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono">{a.actionType}</span>
                    <RiskBadge level={a.riskLevel as any} />
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{a.summary}</div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider">
                    <StatusBadge status={a.status} />
                    <span className="text-muted-foreground">{a.reversibility.replace(/_/g, " ")}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Tool activity" subtitle={`${toolCalls.length}`}>
        {toolCalls.length === 0 ? (
          <Empty>No tool calls recorded yet.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {toolCalls.slice(0, 8).map((tc) => (
              <li key={tc.id} className="border border-border rounded-md p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono">{tc.toolName}</span>
                  <StatusBadge status={tc.status} />
                </div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {tc.input.slice(0, 80)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "accent";
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
        {subtitle && (
          <div
            className={cn(
              "text-[10px] font-mono",
              tone === "accent" ? "text-accent" : "text-muted-foreground"
            )}
          >
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3">
      {children}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const statusMap: Record<string, { icon: any; color: string }> = {
    pending: { icon: CircleDot, color: "text-muted-foreground" },
    in_progress: { icon: Loader2, color: "text-primary" },
    blocked: { icon: CircleAlert, color: "text-destructive" },
    completed: { icon: CircleCheck, color: "text-primary" },
  };
  const s = statusMap[task.status] ?? statusMap.pending;
  const Icon = s.icon;

  const cycle = async () => {
    const order = ["pending", "in_progress", "blocked", "completed"];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    await apiRequest("PATCH", `/api/tasks/${task.id}`, { status: next });
    queryClient.invalidateQueries({
      queryKey: ["/api/conversations", task.conversationId, "tasks"],
    });
  };

  return (
    <li>
      <button
        onClick={cycle}
        data-testid={`button-task-${task.id}`}
        className="w-full text-left border border-border rounded-md p-2.5 hover-elevate active-elevate-2"
      >
        <div className="flex items-start gap-2">
          <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", s.color, task.status === "in_progress" && "animate-spin")} />
          <div className="flex-1 min-w-0">
            <div className="text-sm">{task.title}</div>
            {task.detail && (
              <div className="text-xs text-muted-foreground line-clamp-2">{task.detail}</div>
            )}
            <div className="mt-1 text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
              {task.status.replace("_", " ")}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

function RiskBadge({ level }: { level: "low" | "medium" | "high" | "critical" }) {
  const styles: Record<string, string> = {
    low: "bg-muted text-muted-foreground border-muted-border",
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "text-accent",
    approved: "text-primary",
    denied: "text-destructive",
    expired: "text-muted-foreground",
    queued: "text-muted-foreground",
    running: "text-primary",
    succeeded: "text-primary",
    failed: "text-destructive",
    blocked: "text-destructive",
  };
  return (
    <span className={cn("font-mono text-[10px] uppercase tracking-wider", styles[status])}>
      {status.replace("_", " ")}
    </span>
  );
}
