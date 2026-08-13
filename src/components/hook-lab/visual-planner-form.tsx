"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { HookLanguage, VisualDirection } from "@/lib/hooks/types";

type Props = {
  tenantSlug: string;
  canEdit: boolean;
};

export function VisualPlannerForm({ tenantSlug, canEdit }: Props) {
  const t = useTranslations("pages.hookLab.visualPlanner");

  const [textHook, setTextHook] = useState("");
  const [format, setFormat] = useState<"video" | "static">("video");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "4:5">(
    "9:16",
  );
  const [intent, setIntent] = useState<"iteration" | "big_swing">("big_swing");
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [language, setLanguage] = useState<HookLanguage>("both");
  const [submitting, setSubmitting] = useState(false);
  const [directions, setDirections] = useState<VisualDirection[]>([]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!textHook.trim()) {
      toast.error(t("hookRequired"));
      return;
    }

    setSubmitting(true);
    setDirections([]);
    try {
      const res = await fetch("/api/ai/hooks/visual-variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug,
          textHook,
          format,
          aspectRatio,
          intent,
          product: product.trim() || undefined,
          audience: audience.trim() || undefined,
          language,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || String(res.status));
      }
      const json = (await res.json()) as {
        directions?: VisualDirection[];
      };
      setDirections(json.directions ?? []);
      toast.success(
        t("plannedToast", { n: (json.directions ?? []).length }),
      );
    } catch (err) {
      toast.error(
        t("planFail", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium">{t("hookLabel")}</p>
            <textarea
              className="min-h-[60px] w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
              value={textHook}
              placeholder={t("hookPlaceholder")}
              disabled={submitting}
              onChange={(e) => setTextHook(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="mb-1 text-xs font-medium">{t("formatLabel")}</p>
              <select
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={format}
                disabled={submitting}
                onChange={(e) =>
                  setFormat(e.target.value as "video" | "static")
                }
              >
                <option value="video">{t("formatOptions.video")}</option>
                <option value="static">{t("formatOptions.static")}</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">{t("aspectLabel")}</p>
              <select
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={aspectRatio}
                disabled={submitting}
                onChange={(e) =>
                  setAspectRatio(
                    e.target.value as "9:16" | "1:1" | "4:5",
                  )
                }
              >
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="4:5">4:5</option>
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">{t("intentLabel")}</p>
              <select
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={intent}
                disabled={submitting}
                onChange={(e) =>
                  setIntent(e.target.value as "iteration" | "big_swing")
                }
              >
                <option value="big_swing">
                  {t("intentOptions.bigSwing")}
                </option>
                <option value="iteration">
                  {t("intentOptions.iteration")}
                </option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-medium">{t("productLabel")}</p>
              <Input
                value={product}
                disabled={submitting}
                onChange={(e) => setProduct(e.target.value)}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">{t("audienceLabel")}</p>
              <Input
                value={audience}
                disabled={submitting}
                onChange={(e) => setAudience(e.target.value)}
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium">{t("languageLabel")}</p>
            <select
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={language}
              disabled={submitting}
              onChange={(e) => setLanguage(e.target.value as HookLanguage)}
            >
              <option value="th">{t("languageOptions.th")}</option>
              <option value="en">{t("languageOptions.en")}</option>
              <option value="both">{t("languageOptions.both")}</option>
            </select>
          </div>

          <Button type="submit" disabled={submitting || !canEdit}>
            {submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wand2 className="size-3.5" />
            )}
            {t("submit")}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        {directions.length === 0 && !submitting && (
          <Card className="flex min-h-[200px] items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium">{t("emptyTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("emptyBody")}</p>
            </div>
          </Card>
        )}
        {directions.map((d, idx) => (
          <Card key={idx} className="p-6">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">
              {t("directionNumber", { n: idx + 1 })}
              {d.format ? ` · ${d.format}` : ""}
              {d.aspectRatio ? ` · ${d.aspectRatio}` : ""}
              {typeof d.durationSec === "number" ? ` · ${d.durationSec}s` : ""}
            </p>
            <p className="mt-1 text-base font-semibold">{d.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {d.description}
            </p>
            {d.shotList.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("shotListLabel")}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {d.shotList.map((s, i) => (
                    <li key={i} className="pl-3 -indent-3">
                      · {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.hypothesis && (
              <div className="mt-3 rounded-md bg-muted/40 p-2 text-xs">
                <span className="font-medium">{t("hypothesisLabel")}:</span>{" "}
                {d.hypothesis}
              </div>
            )}
            {d.whyDifferent && (
              <p className="mt-2 text-[11px] italic text-muted-foreground">
                {d.whyDifferent}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
