import {
  AlertTriangle,
  CheckCircle2,
  Heart,
  MessageCircle,
  Share2,
  Target,
  Tv,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CampaignSummary } from "@/lib/frost-engagement";
import { fmtCpe, fmtNum, fmtThb } from "@/lib/frost-engagement";
import type { CreativePreview } from "@/lib/meta/creative-preview";

type Verdict = {
  tone: "good" | "neutral";
  strength: string;
  nextStep: string;
};

function makeVerdict(c: CampaignSummary): Verdict {
  const videoDominant = c.videoViews > c.reactions * 10 && c.videoViews > 1000;
  const reactionDominant = c.reactions > 500 && c.videoViews < 100;
  const balanced = c.comments + c.shares >= 20;

  if (videoDominant) {
    return {
      tone: "good",
      strength: `Reach engine — ${fmtNum(c.videoViews)} วิดีโอวิว ทำให้ CPE ต่ำ (${fmtCpe(c.cpe)})`,
      nextStep: `Scale +20% สำหรับ awareness · ถ้าอยากได้ engagement ลึก เพิ่มแคปชั่นจบด้วยคำถาม`,
    };
  }
  if (reactionDominant) {
    return {
      tone: "good",
      strength: `Like magnet — ภาพดึงได้ ${fmtNum(c.reactions)} reactions`,
      nextStep: `Test variant แคปชั่นใหม่ที่ใส่คำถาม เพื่อ unlock comments · ทำ retargeting ไปยังคนที่กดไลค์`,
    };
  }
  if (balanced) {
    return {
      tone: "good",
      strength: `Balanced — มีทั้ง reactions, comments, shares`,
      nextStep: `เก็บเป็น control · clone เพื่อ test budget tier ที่สูงขึ้น`,
    };
  }
  return {
    tone: "neutral",
    strength: `Mixed signal — กำลังหา audience ที่ใช่`,
    nextStep: `ให้ 48 ชม.อีก ถ้า CPE ยังเท่าเดิม → swap creative ใหม่`,
  };
}

export function CampaignEngagementCard({
  campaign,
  preview,
}: {
  campaign: CampaignSummary;
  preview: CreativePreview | null;
}) {
  const verdict = makeVerdict(campaign);
  const maxVal = Math.max(
    campaign.reactions,
    campaign.comments,
    campaign.shares,
    campaign.videoViews,
    1,
  );

  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <PreviewBox preview={preview} alt={campaign.shortName} />
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          {campaign.channel}
        </span>
      </div>
      <CardContent className="space-y-3 px-4 pt-3 pb-4">
        <div className="line-clamp-2 text-sm font-medium">{campaign.shortName}</div>

        <div className="flex items-baseline gap-3">
          <span className="text-xs text-muted-foreground">CPE</span>
          <span className="text-lg font-semibold tabular-nums">{fmtCpe(campaign.cpe)}</span>
          <span className="text-xs text-muted-foreground">· spend {fmtThb(campaign.spend)}</span>
        </div>

        <div className="space-y-1.5">
          <BreakdownBar
            icon={<Heart className="size-3.5" />}
            label="Reactions"
            value={campaign.reactions}
            max={maxVal}
            tone="neutral"
          />
          <BreakdownBar
            icon={<MessageCircle className="size-3.5" />}
            label="Comments"
            value={campaign.comments}
            max={maxVal}
            tone="good"
          />
          <BreakdownBar
            icon={<Share2 className="size-3.5" />}
            label="Shares"
            value={campaign.shares}
            max={maxVal}
            tone="good"
          />
          <BreakdownBar
            icon={<Tv className="size-3.5" />}
            label="Video views"
            value={campaign.videoViews}
            max={maxVal}
            tone="bad"
          />
        </div>

        <div className="space-y-2">
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              verdict.tone === "good"
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-border bg-muted/30",
            )}
          >
            <p className="flex items-baseline gap-1.5 font-medium text-foreground">
              <CheckCircle2
                className={cn(
                  "size-3.5 shrink-0 translate-y-0.5",
                  verdict.tone === "good"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground",
                )}
              />
              <span>{verdict.strength}</span>
            </p>
          </div>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
            <p className="flex items-baseline gap-1.5 font-medium text-foreground">
              <Target className="size-3.5 shrink-0 translate-y-0.5 text-amber-600 dark:text-amber-400" />
              <span>
                <span className="text-amber-700 dark:text-amber-300">Next step:</span>{" "}
                {verdict.nextStep}
              </span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownBar({
  label,
  value,
  max,
  tone,
  icon,
}: {
  label: string;
  value: number;
  max: number;
  tone: "good" | "bad" | "neutral";
  icon?: React.ReactNode;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const fillClass =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "bad"
        ? "bg-rose-500"
        : "bg-foreground/60";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-medium tabular-nums">{fmtNum(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div className={cn("h-full transition-all", fillClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PreviewBox({ preview, alt }: { preview: CreativePreview | null; alt: string }) {
  const url = preview?.imageUrl ?? preview?.videoThumbUrl ?? null;
  if (!url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground">
        <AlertTriangle className="mr-1 size-3.5" /> No preview
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" className="aspect-video w-full object-cover" />;
}
