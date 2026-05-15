"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { MessageBubble, SAMPLE_PROMPTS, type Message } from "./ai-chat";

/**
 * Full-page AI experience: conversation list on the left, full-width
 * chat thread on the right. Reuses MessageBubble from the FAB.
 *
 * Behavior:
 *   - List shows recent threads (most-recent first)
 *   - "New" button creates a fresh thread
 *   - Selected thread is reflected in `?c=<id>` so refresh + share work
 *   - Auto-create new thread on first load when ?c is missing
 */

type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  _count?: { messages: number };
};

export function AIPageClient({
  tenantSlug,
  initialConversationId,
  initialPrompt,
}: {
  tenantSlug: string;
  initialConversationId: string | null;
  initialPrompt?: string | null;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [prefillConsumed, setPrefillConsumed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load: list + ensure there's an active conversation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchList();
      if (cancelled) return;
      setConversations(list);
      setLoadingList(false);
      if (!activeId) {
        // No conversation selected — pick most recent or create new
        if (list.length > 0) {
          setActiveId(list[0].id);
        } else {
          const id = await createConversation();
          if (id && !cancelled) {
            setActiveId(id);
            setConversations([{ id, title: "New conversation", updatedAt: new Date().toISOString() }]);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingThread(true);
    fetch(
      `/api/ai/conversations/${activeId}/messages?tenantSlug=${tenantSlug}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setMessages(d.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, tenantSlug]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-send prefill prompt (from /ai?q=…) once the conversation is ready.
  // Used by "Diagnose with AI" deep-links from /campaigns and /reports.
  useEffect(() => {
    if (!prefillConsumed && initialPrompt && activeId && !sending && !loadingThread) {
      setPrefillConsumed(true);
      // Small delay lets the input render with the prefill before we fire send,
      // so the user sees their question appear before AI responds.
      const t = setTimeout(() => {
        void send();
      }, 200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, loadingThread, initialPrompt, prefillConsumed]);

  async function fetchList(): Promise<Conversation[]> {
    try {
      const res = await fetch(`/api/ai/conversations?tenantSlug=${tenantSlug}`);
      const data = await res.json();
      return data.conversations ?? [];
    } catch {
      return [];
    }
  }

  async function createConversation(): Promise<string | null> {
    try {
      const res = await fetch(`/api/ai/conversations?tenantSlug=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      return data.conversationId ?? null;
    } catch {
      return null;
    }
  }

  async function startNew() {
    const id = await createConversation();
    if (!id) {
      toast.error("สร้าง conversation ใหม่ไม่ได้");
      return;
    }
    setActiveId(id);
    setMessages([]);
    setConversations((prev) => [
      { id, title: "New conversation", updatedAt: new Date().toISOString() },
      ...prev,
    ]);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !activeId) return;
    setInput("");
    // Optimistic
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        role: "user",
        content: text,
        toolCalls: null,
        pendingAction: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    setSending(true);
    try {
      const res = await fetch(
        `/api/ai/conversations/${activeId}/messages?tenantSlug=${tenantSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ส่งไม่สำเร็จ");
      await reloadThread();
      // Refresh list ordering (touched timestamp)
      const list = await fetchList();
      setConversations(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  async function reloadThread() {
    if (!activeId) return;
    const res = await fetch(
      `/api/ai/conversations/${activeId}/messages?tenantSlug=${tenantSlug}`,
    );
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    }
  }

  async function decideOnPending(messageId: string, decision: "approve" | "reject") {
    if (!activeId || sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/ai/conversations/${activeId}/confirm?tenantSlug=${tenantSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, decision }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Decision failed");
      await reloadThread();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      {/* Conversation list */}
      <Card className="flex h-full min-h-0 flex-col overflow-hidden p-0">
        <div className="border-b border-border p-3">
          <Button
            size="sm"
            onClick={startNew}
            disabled={sending}
            className="w-full gap-1.5"
          >
            <MessageSquarePlus className="size-3.5" />
            New conversation
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              ยังไม่มี conversation
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => {
                const active = c.id === activeId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className={cn(
                        "w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors",
                        active
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <p className="line-clamp-1 font-medium">
                        {c.title || "Untitled"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {c._count?.messages
                          ? `${c._count.messages} messages · `
                          : ""}
                        {formatRelative(c.updatedAt)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {/* Chat thread */}
      <Card className="flex h-full min-h-0 flex-col overflow-hidden p-0">
        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          {!activeId || loadingThread ? (
            <div className="flex items-center justify-center gap-2 py-10">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">กำลังโหลด...</span>
            </div>
          ) : messages.length === 0 ? (
            <EmptyChat onPick={(p) => setInput(p)} />
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onConfirm={() => decideOnPending(m.id, "approve")}
                onCancel={() => decideOnPending(m.id, "reject")}
                disabled={sending}
              />
            ))
          )}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              AI กำลังคิด...
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="พิมพ์คำถามหรือสั่งงาน — เช่น 'ROAS ของ campaign ไหนต่ำสุดในสัปดาห์นี้'"
              disabled={sending || !activeId}
              className="flex-1"
            />
            <Button
              type="submit"
              size="sm"
              disabled={sending || !input.trim() || !activeId}
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            AI ใช้ tools (listCampaigns, getCampaignInsights, searchKnowledge,
            pause/resume/setBudget) ค้นข้อมูลจริงและสั่งงาน
          </p>
        </div>
      </Card>
    </div>
  );
}

function EmptyChat({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <Bot className="size-6 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold">AI Master พร้อมรับคำสั่ง</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          คุยภาษาคนได้ — สั่งหยุด/เปิด/แก้ budget หรือถามข้อมูลจาก campaign จริง
        </p>
      </div>
      <div className="flex flex-col gap-1.5 pt-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          ลองถาม
        </p>
        {SAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-muted"
          >
            <Sparkles className="size-3 text-primary" />
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "เพิ่งใช้";
  if (min < 60) return `${min}m ที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ที่แล้ว`;
  const days = Math.floor(hr / 24);
  return `${days}d ที่แล้ว`;
}
