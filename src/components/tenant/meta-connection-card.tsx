"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MetaIcon } from "@/components/icons/meta";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

export type MetaConnectionData =
  | { connected: false }
  | {
      connected: true;
      connection: {
        metaUserName: string;
        status: "ACTIVE" | "EXPIRED" | "REVOKED";
        connectedAt: string;
        lastSyncedAt: string | null;
        tokenExpiresAt: string | null;
        accountCount: number;
      };
      accounts: Array<{
        metaAccountId: string;
        name: string;
        currency: string;
        accountStatus: number;
        businessName: string | null;
      }>;
    };

type Props = {
  tenantSlug: string;
  role: "OWNER" | "MEDIA_BUYER" | "VIEWER";
  data: MetaConnectionData;
  flash: { success: boolean; error: string | null };
};

export function MetaConnectionCard({ tenantSlug, role, data, flash }: Props) {
  const t = useTranslations("metaConnection");
  const router = useRouter();
  const [pending, setPending] = useState<null | "sync" | "disconnect">(null);
  const isOwner = role === "OWNER";

  async function handleSync() {
    if (pending) return;
    setPending("sync");
    try {
      const res = await fetch(`/api/meta/sync?tenantSlug=${tenantSlug}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? t("syncFailedDefault"));
      toast.success(t("syncSuccess", { count: body.accountCount }));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("syncFailedDefault"));
    } finally {
      setPending(null);
    }
  }

  async function handleDisconnect() {
    if (pending) return;
    if (!confirm(t("disconnectConfirm"))) return;
    setPending("disconnect");
    try {
      const res = await fetch(`/api/meta/disconnect?tenantSlug=${tenantSlug}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? t("disconnectFailedDefault"));
      }
      toast.success(t("disconnectSuccess"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("disconnectFailedDefault"));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {flash.success && (
        <Alert>
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <AlertDescription>{t("flashSuccess")}</AlertDescription>
        </Alert>
      )}
      {flash.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t("flashError", { error: flash.error })}</AlertDescription>
        </Alert>
      )}

      <Card className="p-6">
        {data.connected ? (
          <ConnectedView
            data={data}
            tenantSlug={tenantSlug}
            isOwner={isOwner}
            pending={pending}
            onSync={handleSync}
            onDisconnect={handleDisconnect}
          />
        ) : (
          <DisconnectedView tenantSlug={tenantSlug} isOwner={isOwner} />
        )}
      </Card>

      {data.connected && data.accounts.length > 0 && <AccountsTable accounts={data.accounts} />}
    </div>
  );
}

function DisconnectedView({ tenantSlug, isOwner }: { tenantSlug: string; isOwner: boolean }) {
  const t = useTranslations("metaConnection");
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-[#1877F2]/10">
        <MetaIcon className="size-6 text-[#1877F2]" />
      </div>
      <div>
        <h3 className="text-base font-semibold">{t("notConnectedTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("notConnectedBody")}
        </p>
      </div>
      {isOwner ? (
        <a
          href={`/api/meta/oauth/start?tenantSlug=${tenantSlug}`}
          className={cn(buttonVariants({ size: "lg" }), "gap-2 bg-[#1877F2] text-white hover:bg-[#166FE5]")}
        >
          <MetaIcon className="size-4" />
          {t("connectBtn")}
          <ExternalLink className="size-3.5" />
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p>
      )}
    </div>
  );
}

function ConnectedView({
  data,
  tenantSlug,
  isOwner,
  pending,
  onSync,
  onDisconnect,
}: {
  data: Extract<MetaConnectionData, { connected: true }>;
  tenantSlug: string;
  isOwner: boolean;
  pending: null | "sync" | "disconnect";
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const t = useTranslations("metaConnection");
  const locale = useLocale();
  const isExpired = data.connection.status === "EXPIRED" || data.connection.status === "REVOKED";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex size-10 items-center justify-center rounded-full bg-[#1877F2]/10">
            <MetaIcon className="size-5 text-[#1877F2]" />
            <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-background">
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            </span>
          </div>
          <div>
            <p className="text-base font-semibold">{data.connection.metaUserName}</p>
            <p className="text-xs text-muted-foreground">
              {data.connection.accountCount} ad accounts ·{" "}
              {t("connectedAt", { when: formatDate(new Date(data.connection.connectedAt), locale) })}
              {data.connection.lastSyncedAt && (
                <> · {t("lastSynced", { when: formatDateTime(data.connection.lastSyncedAt, locale) })}</>
              )}
            </p>
          </div>
        </div>

        {isOwner && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSync}
              disabled={pending !== null || isExpired}
              className="gap-1.5"
            >
              <RefreshCw className={cn("size-3.5", pending === "sync" && "animate-spin")} />
              {pending === "sync" ? t("syncing") : t("syncBtn")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDisconnect}
              disabled={pending !== null}
              className="gap-1.5"
            >
              <Unplug className="size-3.5" />
              {pending === "disconnect" ? t("disconnecting") : t("disconnectBtn")}
            </Button>
          </div>
        )}
      </div>

      {isExpired && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            {t("tokenExpired")}
            {isOwner && (
              <>
                {" "}
                <a
                  href={`/api/meta/oauth/start?tenantSlug=${tenantSlug}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {t("reconnect")}
                </a>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function AccountsTable({
  accounts,
}: {
  accounts: Array<{
    metaAccountId: string;
    name: string;
    currency: string;
    accountStatus: number;
    businessName: string | null;
  }>;
}) {
  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-left">
            <tr>
              <Th>Ad Account</Th>
              <Th>Business</Th>
              <Th>Currency</Th>
              <Th>Status</Th>
              <Th>ID</Th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.metaAccountId} className="border-b border-border last:border-0">
                <Td className="font-medium">{a.name}</Td>
                <Td className="text-muted-foreground">{a.businessName ?? "—"}</Td>
                <Td>{a.currency}</Td>
                <Td>
                  <AccountStatusBadge status={a.accountStatus} />
                </Td>
                <Td className="font-mono text-xs text-muted-foreground">{a.metaAccountId}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}

const ACCOUNT_STATUS_LABEL: Record<number, { label: string; tone: "good" | "warn" | "bad" }> = {
  1: { label: "ACTIVE", tone: "good" },
  2: { label: "DISABLED", tone: "bad" },
  3: { label: "UNSETTLED", tone: "warn" },
  7: { label: "PENDING_RISK_REVIEW", tone: "warn" },
  8: { label: "PENDING_SETTLEMENT", tone: "warn" },
  9: { label: "IN_GRACE_PERIOD", tone: "warn" },
  100: { label: "PENDING_CLOSURE", tone: "warn" },
  101: { label: "CLOSED", tone: "bad" },
  201: { label: "ANY_ACTIVE", tone: "good" },
  202: { label: "ANY_CLOSED", tone: "bad" },
};

function AccountStatusBadge({ status }: { status: number }) {
  const meta = ACCOUNT_STATUS_LABEL[status] ?? { label: `Status ${status}`, tone: "warn" as const };
  const toneClass =
    meta.tone === "good"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : meta.tone === "bad"
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", toneClass)}>
      {meta.label}
    </span>
  );
}
