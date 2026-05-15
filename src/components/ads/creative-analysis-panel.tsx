"use client";

import { CheckCircle2, AlertCircle, Lightbulb } from "lucide-react";

export type CreativeAnalysis = {
  hook: string;
  visualHierarchy: number;
  textLegibility: number;
  emotionalTone: string;
  dominantColor: string;
  strengths: string[];
  weaknesses: string[];
  suggestedFixes: string[];
};

function Pips({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={
            i < value
              ? "h-1.5 w-3 rounded-full bg-teal-500"
              : "h-1.5 w-3 rounded-full bg-muted"
          }
        />
      ))}
    </span>
  );
}

export function CreativeAnalysisPanel({
  analysis,
  cachedAt,
}: {
  analysis: CreativeAnalysis;
  cachedAt?: string;
}) {
  const cachedLabel = cachedAt
    ? new Date(cachedAt).toLocaleString("th-TH", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Hook</p>
          <p className="font-medium leading-snug">🎯 {analysis.hook}</p>
        </div>
        {cachedLabel && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            บันทึก {cachedLabel}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <p className="text-muted-foreground">จุดโฟกัสภาพ</p>
          <Pips value={analysis.visualHierarchy} />
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">อ่านง่ายบนมือถือ</p>
          <Pips value={analysis.textLegibility} />
        </div>
        <div>
          <p className="text-muted-foreground">โทนอารมณ์</p>
          <p className="font-medium">{analysis.emotionalTone}</p>
        </div>
        <div>
          <p className="text-muted-foreground">สีเด่น</p>
          <p className="font-medium">{analysis.dominantColor}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" /> จุดเด่น
          </p>
          <ul className="space-y-0.5 pl-5 text-xs">
            {analysis.strengths.map((s, i) => (
              <li key={i} className="list-disc">
                {s}
              </li>
            ))}
          </ul>
        </div>

        {analysis.weaknesses.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-3.5" /> ต้องแก้
            </p>
            <ul className="space-y-0.5 pl-5 text-xs">
              {analysis.weaknesses.map((s, i) => (
                <li key={i} className="list-disc">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.suggestedFixes.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400">
              <Lightbulb className="size-3.5" /> ลองแก้
            </p>
            <ul className="space-y-0.5 pl-5 text-xs">
              {analysis.suggestedFixes.map((s, i) => (
                <li key={i} className="list-disc">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
