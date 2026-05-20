"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  Check,
  Loader2,
  Maximize2,
  Send,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Message = {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  toolCalls: unknown | null;
  pendingAction: string | null;
  createdAt: string;
};

/**
 * Sample prompt keys (resolved via pages.ai.chat.samplePrompts.<key>).
 * Kept exported so the full-page AI client can reuse the same set.
 */
export const SAMPLE_PROMPT_KEYS = [
  "listActive",
  "worstBudget",
  "digittribeRoas",
] as const;

/**
 * Compatibility export: returns the *current locale's* resolved prompt
 * strings for callers that need them as a plain array (e.g. EmptyChat
 * on the full-page AI client). Hooked from a component context.
 */
export function useSamplePrompts(): string[] {
  const t = useTranslations("pages.ai.chat.samplePrompts");
  return SAMPLE_PROMPT_KEYS.map((k) => t(k));
}

// Back-compat: existing imports of SAMPLE_PROMPTS still resolve, but
// they should be replaced with useSamplePrompts() inside components.
// This array holds the *keys*, so consumers must translate before render.
export const SAMPLE_PROMPTS: readonly string[] = SAMPLE_PROMPT_KEYS;

/**
 * Floating chat panel. Sits as a FAB bottom-right on every
 * tenant page and expands to a slide-over drawer on click. State
 * (open/closed, active conversation id) lives in component state —
 * we re-create a thread per session unless the user explicitly picks
 * an old one. Keeps the surface minimal until we add a thread list.
 */
export function AIChat({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations("pages.ai.chat");
  const samplePrompts = useSamplePrompts();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (conversationId) return;
    // Lazy-create a fresh conversation on first open
    fetch(`/api/ai/conversations?tenantSlug=${tenantSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then((d) => setConversationId(d.conversationId))
      .catch(() => {
        toast.error(t("startFailed"));
      });
  }, [open, tenantSlug, conversationId, t]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending || !conversationId) return;
    setInput("");
    // Optimistic user bubble
    // eslint-disable-next-line react-hooks/purity -- send() is invoked from form onSubmit / event handlers, not render; Date.now() is safe here
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
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
        `/api/ai/conversations/${conversationId}/messages?tenantSlug=${tenantSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? t("sendFailed"));
      }
      // Reload full thread so tool_call + tool_result rows show
      await loadMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("sendFailed"));
    } finally {
      setSending(false);
    }
  }

  async function decideOnPending(messageId: string, decision: "approve" | "reject") {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/ai/conversations/${conversationId}/confirm?tenantSlug=${tenantSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, decision }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("decisionFailed"));
      await loadMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("decisionFailed"));
    } finally {
      setSending(false);
    }
  }

  async function loadMessages() {
    if (!conversationId) return;
    const res = await fetch(
      `/api/ai/conversations/${conversationId}/messages?tenantSlug=${tenantSlug}`,
    );
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    }
  }

  // Load when conversation id is set (after FAB open)
  useEffect(() => {
    if (conversationId) void loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-lg transition-all hover:scale-105",
          open && "opacity-0 pointer-events-none",
        )}
        title={t("fabLabel")}
      >
        <Sparkles className="size-4" />
        <span className="text-sm font-medium">{t("fabLabel")}</span>
      </button>

      {/* Slide-over panel */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col bg-background shadow-2xl"
          >
            {/* Header */}
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                  <Bot className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">AI Master</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t("expertSubtitle")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href={`/t/${tenantSlug}/ai${conversationId ? `?c=${conversationId}` : ""}`}
                  onClick={() => setOpen(false)}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={t("openFullPage")}
                >
                  <Maximize2 className="size-3.5" />
                </Link>
                <Button size="icon-sm" variant="ghost" onClick={() => setOpen(false)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {messages.length === 0 && !sending && (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
                  <Sparkles className="size-8 text-primary/40" />
                  <p>{t("emptyHint")}</p>
                  <div className="flex flex-col gap-1">
                    {samplePrompts.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setInput(p)}
                        className="rounded-md border border-border bg-background px-2 py-1 text-left text-xs text-foreground hover:bg-muted"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  onConfirm={() => decideOnPending(m.id, "approve")}
                  onCancel={() => decideOnPending(m.id, "reject")}
                  disabled={sending}
                />
              ))}

              {sending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {t("thinking")}
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
                  placeholder={t("inputPlaceholder")}
                  disabled={sending || !conversationId}
                  className="flex-1"
                />
                <Button type="submit" size="sm" disabled={sending || !input.trim() || !conversationId}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </form>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {t("toolsHint")}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function MessageBubble({
  message,
  onConfirm,
  onCancel,
  disabled,
}: {
  message: Message;
  onConfirm: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("pages.ai.chat");
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "assistant") {
    if (!message.content) return null;
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] space-y-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
          <pre className="whitespace-pre-wrap break-words font-sans">{message.content}</pre>
        </div>
      </div>
    );
  }

  if (message.role === "tool_call") {
    // Pending = render a prominent confirmation card. Resolved (approved/rejected)
    // = render a small chip indicating the outcome.
    if (message.pendingAction === "pending") {
      return (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {t("confirm.title")}
              </p>
              <p className="mt-0.5 text-sm text-amber-950 dark:text-amber-100">
                {message.content}
              </p>
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={onCancel}
              className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {t("confirm.cancel")}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onConfirm}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <Check className="size-3" strokeWidth={3} />
              {t("confirm.confirm")}
            </button>
          </div>
        </div>
      );
    }
    if (message.pendingAction === "approved" || message.pendingAction === "rejected") {
      const isApproved = message.pendingAction === "approved";
      return (
        <div className="flex justify-start">
          <div
            className={cn(
              "inline-flex max-w-[85%] items-center gap-1.5 rounded-md px-2 py-1 text-[11px]",
              isApproved
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {isApproved ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" />}
            {isApproved ? t("approved") : t("cancelled")}
            <code className="font-medium">{truncate(message.content, 80)}</code>
          </div>
        </div>
      );
    }
    return null;
  }

  if (message.role === "tool_result") {
    return (
      <div className="flex justify-start">
        <div className="inline-flex max-w-[85%] items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground">
          <Wrench className="size-3" />
          {t("resultLabel")}<code className="text-foreground">{truncate(message.content, 80)}</code>
        </div>
      </div>
    );
  }

  return null;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
