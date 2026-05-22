import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Memory, MemoryCategory } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Brain } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CATEGORIES: { id: MemoryCategory; label: string; desc: string }[] = [
  { id: "preference", label: "Preference", desc: "Stable likes, dislikes, defaults." },
  { id: "project", label: "Project", desc: "Active projects and context." },
  { id: "goal", label: "Goal", desc: "Ongoing objectives, e.g. certifications." },
  { id: "tool", label: "Tool", desc: "Preferred stacks, frameworks, languages." },
  { id: "style", label: "Style", desc: "Writing, tone, and voice rules." },
  { id: "other", label: "Other", desc: "Anything durable that does not fit above." },
];

export function MemoryPage() {
  const { data: memories = [] } = useQuery<Memory[]>({
    queryKey: ["/api/memory"],
    refetchInterval: false,
  });

  const [content, setContent] = useState("");
  const [category, setCategory] = useState<MemoryCategory>("preference");

  const create = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/memory", {
        content: content.trim(),
        category,
        confidence: 90,
        enabled: 1,
      });
    },
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["/api/memory"] });
    },
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <header>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">Memory</div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" /> Durable preferences
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Memory holds stable facts about you, your projects, goals, tools, and style. It does
            not hold one-off task notes, and it must not hold secrets. You can disable, edit, or
            delete any entry.
          </p>
        </header>

        <Card className="p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Add memory
          </div>
          <Input
            data-testid="input-memory-content"
            placeholder="e.g. Prefer direct, no-flattery responses."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Select value={category} onValueChange={(v) => setCategory(v as MemoryCategory)}>
              <SelectTrigger className="w-56" data-testid="select-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label} — {c.desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              data-testid="button-create-memory"
              onClick={() => create.mutate()}
              disabled={!content.trim() || create.isPending}
            >
              <Plus className="w-4 h-4 mr-2" /> Add
            </Button>
          </div>
        </Card>

        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Saved ({memories.length})
          </div>
          {memories.length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground">
              No memory yet. Say "remember that I prefer direct answers" in chat, or add one above.
            </Card>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <MemoryRow key={m.id} memory={m} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MemoryRow({ memory }: { memory: Memory }) {
  const [content, setContent] = useState(memory.content);
  const [category, setCategory] = useState<MemoryCategory>(memory.category as MemoryCategory);

  const save = useMutation({
    mutationFn: async (patch: Partial<Memory>) => {
      await apiRequest("PATCH", `/api/memory/${memory.id}`, patch);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/memory"] }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/memory/${memory.id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/memory"] }),
  });

  return (
    <Card className={`p-3 ${memory.enabled === 0 ? "opacity-50" : ""}`} data-testid={`row-memory-${memory.id}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <Input
            data-testid={`input-memory-${memory.id}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={() => content !== memory.content && save.mutate({ content })}
            className="bg-transparent border-transparent focus-visible:border-input"
          />
          <div className="flex items-center gap-2 text-xs">
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v as MemoryCategory);
                save.mutate({ category: v as MemoryCategory });
              }}
            >
              <SelectTrigger className="w-40 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="font-mono text-[10px]">
              confidence {memory.confidence}
            </Badge>
            <span className="text-muted-foreground font-mono text-[10px]">
              {new Date(memory.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col items-center gap-1">
            <Switch
              data-testid={`switch-memory-${memory.id}`}
              checked={memory.enabled === 1}
              onCheckedChange={(v) => save.mutate({ enabled: v ? 1 : 0 })}
            />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {memory.enabled === 1 ? "on" : "off"}
            </span>
          </div>
          <Button
            data-testid={`button-delete-memory-${memory.id}`}
            variant="ghost"
            size="icon"
            onClick={() => remove.mutate()}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
