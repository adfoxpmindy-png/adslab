"use client";

import Link from "next/link";
import { ExternalLink, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { JourneyNode } from "@/lib/journey/types";

export function JourneyDetailDrawer({
  tenantSlug,
  node,
  onClose,
}: {
  tenantSlug: string;
  node: JourneyNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-background shadow-2xl"
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <p className="text-sm font-semibold capitalize">{node.kind}</p>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <h2 className="text-lg font-semibold">{node.label}</h2>

          {node.kind === "post" && (
            <PostDetail tenantSlug={tenantSlug} node={node} />
          )}
          {node.kind === "brand" && <BrandDetail node={node} />}
          {node.kind === "conversion" && <ConversionDetail node={node} />}
          {node.kind === "campaign" && <CampaignDetail node={node} tenantSlug={tenantSlug} />}
        </div>
      </div>
    </div>
  );
}

function PostDetail({
  tenantSlug,
  node,
}: {
  tenantSlug: string;
  node: Extract<JourneyNode, { kind: "post" }>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Stat label="Reach" value={Intl.NumberFormat("en").format(node.reach)} />
        <Stat label="CTR" value={`${node.ctr.toFixed(2)}%`} />
      </div>
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          Funnel stage
        </p>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize">
          {node.stage}
        </span>
      </div>
      <div className="flex gap-2">
        <Link
          href={`/t/${tenantSlug}/campaigns?highlight=${node.campaignIds[0] ?? ""}`}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          เปิดใน Campaigns
          <ExternalLink className="size-3" />
        </Link>
      </div>
    </div>
  );
}

function BrandDetail({ node }: { node: Extract<JourneyNode, { kind: "brand" }> }) {
  return (
    <div className="space-y-3">
      <div className="text-sm">
        <p className="text-muted-foreground">Platform</p>
        <p className="mt-0.5 font-medium capitalize">{node.platform}</p>
      </div>
      <div className="text-sm">
        <p className="text-muted-foreground">URL</p>
        <a
          href={node.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 break-all font-medium text-primary hover:underline"
        >
          {node.url}
        </a>
      </div>
    </div>
  );
}

function ConversionDetail({
  node,
}: {
  node: Extract<JourneyNode, { kind: "conversion" }>;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <p className="font-semibold">{node.eventType}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {Intl.NumberFormat("en").format(node.fires)} fires in this range
        </p>
      </div>
      {node.customConversionId && (
        <p className="text-xs text-muted-foreground">
          Linked to Custom Conversion ID: <code>{node.customConversionId}</code>
        </p>
      )}
    </div>
  );
}

function CampaignDetail({
  node,
  tenantSlug,
}: {
  node: Extract<JourneyNode, { kind: "campaign" }>;
  tenantSlug: string;
}) {
  return (
    <div className="space-y-3">
      <Stat
        label="Spend"
        value={`฿${Intl.NumberFormat("th-TH").format(Math.round(node.spend))}`}
      />
      <div className="text-sm">
        <p className="text-muted-foreground">Objective</p>
        <p className="mt-0.5 font-medium">{node.objective ?? "—"}</p>
      </div>
      <Link
        href={`/t/${tenantSlug}/campaigns?highlight=${node.metaCampaignId}`}
        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
      >
        เปิดใน Campaigns
        <ExternalLink className="size-3" />
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
