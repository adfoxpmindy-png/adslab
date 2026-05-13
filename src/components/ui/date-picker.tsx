"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Thai-first date picker, custom built (no library).
 *
 * Why custom: native `<input type="date">` UX is browser-default and
 * inconsistent across Windows / Mac / mobile. Date libraries (react-day-
 * picker etc.) add ~50KB. A 200-line custom component handles 95% of
 * what users need.
 *
 * Returns ISO date strings ("YYYY-MM-DD") via `onChange`.
 */

type Props = {
  /**
   * ISO string.
   *   - When `showTime` is false: "YYYY-MM-DD" or ""
   *   - When `showTime` is true:  "YYYY-MM-DDTHH:mm" or ""
   */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  min?: string; // "YYYY-MM-DD"
  max?: string;
  /** Show hour + minute picker below the calendar. Default false. */
  showTime?: boolean;
};

const THAI_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateFromIso(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Build a 6×7 grid of dates covering the month view (including spillover) */
function monthGrid(year: number, month: number): Date[] {
  // first cell = Sunday before/on the 1st of the month
  const first = new Date(year, month, 1);
  const offset = first.getDay(); // 0=Sun
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function formatThaiLabel(iso: string, showTime: boolean): string {
  if (!iso) return "";
  // Split datetime from date portion
  const [datePart, timePart] = iso.split("T");
  const d = dateFromIso(datePart);
  if (!d) return "";
  const dateStr = `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
  if (showTime && timePart) {
    return `${dateStr} · ${timePart.slice(0, 5)} น.`;
  }
  return dateStr;
}

function parseTimeFromIso(iso: string): { hour: number; minute: number } {
  const t = iso.split("T")[1];
  if (!t) return { hour: 9, minute: 0 }; // default 09:00
  const [hh, mm] = t.split(":");
  return { hour: Number(hh) || 0, minute: Number(mm) || 0 };
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  min,
  max,
  showTime = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Parse value: support both "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm"
  const datePart = value.split("T")[0] ?? "";
  const initial = dateFromIso(datePart) ?? new Date();
  const [view, setView] = useState({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  });
  // Local time state — sync to value
  const initialTime = parseTimeFromIso(value);
  const [hour, setHour] = useState<number>(initialTime.hour);
  const [minute, setMinute] = useState<number>(initialTime.minute);

  // Sync view + time when value changes externally
  useEffect(() => {
    const d = dateFromIso(value.split("T")[0] ?? "");
    if (d) setView({ year: d.getFullYear(), month: d.getMonth() });
    if (showTime) {
      const t = parseTimeFromIso(value);
      setHour(t.hour);
      setMinute(t.minute);
    }
  }, [value, showTime]);

  /**
   * Build the output ISO string from the picked date + current time state.
   * Centralized here so date-click and time-change both produce consistent output.
   */
  function emit(dateIso: string, h: number = hour, m: number = minute) {
    if (!dateIso) {
      onChange("");
      return;
    }
    if (showTime) {
      onChange(`${dateIso}T${pad(h)}:${pad(m)}`);
    } else {
      onChange(dateIso);
    }
  }

  // Compute position whenever popup opens or window resizes.
  // useLayoutEffect to avoid one-frame flicker.
  useLayoutEffect(() => {
    if (!open) return;
    function updatePos() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // Pop-up width is 280px; if there's not enough space on the right,
      // right-align to the trigger.
      const popupWidth = 280;
      const left = Math.min(
        r.left + window.scrollX,
        window.scrollX + window.innerWidth - popupWidth - 8,
      );
      setPopupPos({ top: r.bottom + window.scrollY + 4, left });
    }
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  // Close on outside click — must check BOTH the trigger and the
  // (portal-rendered) popup, since they're in different DOM subtrees.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const grid = monthGrid(view.year, view.month);
  const todayIso = isoFromDate(new Date());
  const minDate = min ? dateFromIso(min) : null;
  const maxDate = max ? dateFromIso(max) : null;

  function shiftMonth(delta: number) {
    let { year, month } = view;
    month += delta;
    while (month < 0) {
      year -= 1;
      month += 12;
    }
    while (month > 11) {
      year += 1;
      month -= 12;
    }
    setView({ year, month });
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 text-left text-sm transition-colors",
          "hover:border-ring focus:outline-none focus:ring-3 focus:ring-ring/50",
        )}
      >
        <Calendar className="size-4 text-muted-foreground" />
        <span className={cn("flex-1 truncate", !value && "text-muted-foreground")}>
          {value ? formatThaiLabel(value, showTime) : placeholder ?? "เลือกวันที่"}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              emit("");
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </span>
        )}
      </button>

      {mounted && open && popupPos && createPortal(
        <div
          ref={popupRef}
          style={{ top: popupPos.top, left: popupPos.left }}
          className="absolute z-[100] w-[280px] rounded-lg border border-border bg-background p-3 shadow-lg"
        >
          {/* Header */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded p-1 hover:bg-muted"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="text-sm font-semibold">
              {THAI_MONTHS[view.month]} {view.year + 543}
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded p-1 hover:bg-muted"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium uppercase text-muted-foreground">
            {THAI_WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {grid.map((d, i) => {
              const iso = isoFromDate(d);
              const inMonth = d.getMonth() === view.month;
              const isSelected = iso === value;
              const isToday = iso === todayIso;
              const isDisabled =
                (minDate && d < minDate) || (maxDate && d > maxDate);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!!isDisabled}
                  onClick={() => {
                    emit(iso);
                    // Keep popup open when picking time so user can adjust HH:mm
                    if (!showTime) setOpen(false);
                  }}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-xs transition-colors",
                    !inMonth && "text-muted-foreground/40",
                    inMonth && !isSelected && "hover:bg-muted",
                    isSelected && "bg-primary text-primary-foreground font-semibold",
                    isToday && !isSelected && "ring-1 ring-primary/40",
                    isDisabled && "cursor-not-allowed opacity-30",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Time picker — shown only in datetime mode */}
          {showTime && (
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                เวลา
              </span>
              <select
                value={hour}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  setHour(h);
                  // Re-emit with the existing date if we have one
                  const d = value.split("T")[0];
                  if (d) emit(d, h, minute);
                }}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-xs tabular-nums"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {pad(i)}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">:</span>
              <select
                value={minute}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  setMinute(m);
                  const d = value.split("T")[0];
                  if (d) emit(d, hour, m);
                }}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-xs tabular-nums"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <option key={m} value={m}>
                    {pad(m)}
                  </option>
                ))}
              </select>
              <span className="ml-auto text-[11px] text-muted-foreground">น. (UTC+7)</span>
            </div>
          )}

          {/* Footer */}
          <div className="mt-2 flex justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => emit("")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ล้าง
            </button>
            {showTime ? (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-primary hover:underline"
              >
                ตกลง
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  emit(todayIso);
                  setOpen(false);
                }}
                className="text-xs text-primary hover:underline"
              >
                วันนี้
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
