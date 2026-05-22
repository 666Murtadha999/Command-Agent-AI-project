import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquare,
  Brain,
  ShieldCheck,
  ScrollText,
  Settings as SettingsIcon,
  Wrench,
  Plus,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import type { Conversation, ApprovalRequest } from "@shared/schema";
import { CommandAgentLogo } from "@/components/logo";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    refetchInterval: 5000,
  });

  const { data: approvals = [] } = useQuery<ApprovalRequest[]>({
    queryKey: ["/api/approvals"],
    refetchInterval: 4000,
  });

  const pendingApprovals = approvals.filter((a) => a.status === "pending").length;

  const navItems = [
    { href: "/", label: "Chat", icon: MessageSquare, active: location === "/" || location.startsWith("/c/") },
    { href: "/memory", label: "Memory", icon: Brain, active: location === "/memory" },
    {
      href: "/approvals",
      label: "Approvals",
      icon: ShieldCheck,
      active: location === "/approvals",
      badge: pendingApprovals > 0 ? pendingApprovals : undefined,
    },
    { href: "/tools", label: "Tools", icon: Wrench, active: location === "/tools" },
    { href: "/audit", label: "Audit", icon: ScrollText, active: location === "/audit" },
    { href: "/settings", label: "Settings", icon: SettingsIcon, active: location === "/settings" },
  ];

  const createConversation = async () => {
    const res = await apiRequest("POST", "/api/conversations", { title: "New conversation" });
    const c: Conversation = await res.json();
    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    navigate(`/c/${c.id}`);
  };

  return (
    <div className="relative z-10 flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
          <CommandAgentLogo className="w-6 h-6 text-primary" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">Command Agent</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">local · v0.1</span>
          </div>
        </div>

        <nav className="px-2 py-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`link-${item.label.toLowerCase()}`}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm border border-transparent hover-elevate active-elevate-2",
                item.active && "bg-sidebar-accent border-sidebar-accent-border text-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="px-3 mt-2">
          <Button
            data-testid="button-new-conversation"
            onClick={createConversation}
            variant="outline"
            className="w-full justify-start gap-2"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            New conversation
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          <div className="px-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Conversations
          </div>
          {conversations.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No conversations yet. Start one below.
            </div>
          )}
          {conversations.map((c) => {
            const active = location === `/c/${c.id}`;
            return (
              <Link
                key={c.id}
                href={`/c/${c.id}`}
                data-testid={`link-conversation-${c.id}`}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm border border-transparent hover-elevate active-elevate-2 truncate",
                  active && "bg-sidebar-accent border-sidebar-accent-border"
                )}
                title={c.title}
              >
                {c.title || "Untitled"}
              </Link>
            );
          })}
        </div>

        <div className="border-t border-sidebar-border px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="status-dot text-primary" />
          <Activity className="w-3 h-3" />
          <span>local · mock provider</span>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">{children}</main>
    </div>
  );
}
