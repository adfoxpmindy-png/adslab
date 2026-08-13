"use client";

/**
 * Client-side debounced heuristic-check hook for Hook Lab v2.
 *
 * Blocker 3 wiring — every draft/iterated concept runs through the
 * /api/ai/hooks/heuristic-check endpoint (100 calls/day per tenant)
 * so the UI can render an Andromeda-risk badge and, when HIGH, gate the
 * Save flow with the warn+confirm modal.
 *
 * Fires debounced (~800ms) after `newTextHook` (or dependencies) change.
 * In-flight requests are aborted when input mutates. `enabled=false` or
 * an empty `newTextHook` shorts the effect out.
 */

import { useEffect, useReducer, useRef } from "react";

import type {
  AlignmentVerdict,
  AndromedaCheckResult,
  AndromedaRisk,
  HookLanguage,
  VisualDirection,
  VisualDiffVerdict,
} from "@/lib/hooks/types";

export interface UseHeuristicCheckInput {
  tenantSlug: string;
  controlTextHook?: string;
  controlBody?: string;
  controlVisualSummary?: string;
  controlDominantAttributes?: string[];
  previousWinnerVisualSummaries?: string[];
  newTextHook: string;
  newBody?: string;
  newVisualDirections?: VisualDirection[];
  language?: HookLanguage;
  /** Skip the check entirely when false — used when no control is present. */
  enabled?: boolean;
  /** Debounce window in ms. Defaults to 800. */
  debounceMs?: number;
}

export interface UseHeuristicCheckReturn {
  risk: AndromedaRisk | null;
  alignmentVerdict: AlignmentVerdict | null;
  visualDiff: {
    sharedAttributes: string[];
    differentAttributes: string[];
    verdict: VisualDiffVerdict;
  } | null;
  reasoning: string | null;
  suggestion: string | null;
  isChecking: boolean;
  error: string | null;
}

interface ApiResponse {
  ok: true;
  result: AndromedaCheckResult;
}

type State = UseHeuristicCheckReturn;

type Action =
  | { type: "reset" }
  | { type: "clearOutput" }
  | { type: "start" }
  | { type: "success"; result: AndromedaCheckResult }
  | { type: "error"; message: string };

const INITIAL_STATE: State = {
  risk: null,
  alignmentVerdict: null,
  visualDiff: null,
  reasoning: null,
  suggestion: null,
  isChecking: false,
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return INITIAL_STATE;
    case "clearOutput":
      return { ...state, risk: null, reasoning: null, suggestion: null };
    case "start":
      return { ...state, isChecking: true, error: null };
    case "success":
      return {
        risk: action.result.combinedRisk,
        alignmentVerdict: action.result.alignmentVerdict,
        visualDiff: action.result.visualDiff,
        reasoning: action.result.reasoning,
        suggestion: action.result.suggestion,
        isChecking: false,
        error: null,
      };
    case "error":
      return { ...state, isChecking: false, error: action.message };
    default:
      return state;
  }
}

/**
 * useHeuristicCheck — subscribe one concept's copy+visual to the
 * heuristic-check endpoint. Callers pass one concept per hook invocation;
 * for a list of concepts, wrap ConceptCard in a per-item component that
 * calls this hook.
 */
export function useHeuristicCheck(
  input: UseHeuristicCheckInput,
): UseHeuristicCheckReturn {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const abortRef = useRef<AbortController | null>(null);
  const {
    tenantSlug,
    controlTextHook,
    controlBody,
    controlVisualSummary,
    controlDominantAttributes,
    previousWinnerVisualSummaries,
    newTextHook,
    newBody,
    newVisualDirections,
    language,
    enabled = true,
    debounceMs = 800,
  } = input;

  // Stable string-keyed deps — arrays/objects would trigger re-runs every render.
  const attrsKey = (controlDominantAttributes ?? []).join("|");
  const prevKey = (previousWinnerVisualSummaries ?? []).join("|");
  const visualsKey = JSON.stringify(newVisualDirections ?? null);

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => dispatch({ type: "reset" }));
      return;
    }
    if (!newTextHook || !newTextHook.trim()) {
      queueMicrotask(() => dispatch({ type: "clearOutput" }));
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      dispatch({ type: "start" });
      try {
        const res = await fetch("/api/ai/hooks/heuristic-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            tenantSlug,
            controlHookText: controlTextHook || undefined,
            controlBodyText: controlBody || undefined,
            controlVisualSummary: controlVisualSummary || undefined,
            controlDominantAttributes:
              controlDominantAttributes && controlDominantAttributes.length > 0
                ? controlDominantAttributes
                : undefined,
            previousWinnerVisualSummaries:
              previousWinnerVisualSummaries &&
              previousWinnerVisualSummaries.length > 0
                ? previousWinnerVisualSummaries
                : undefined,
            newTextHook,
            newBody: newBody || undefined,
            newVisualDirections:
              newVisualDirections && newVisualDirections.length > 0
                ? newVisualDirections
                : undefined,
            language: language ?? "both",
          }),
        });
        if (!res.ok) {
          const message = await res.text().catch(() => String(res.status));
          throw new Error(message || String(res.status));
        }
        const json = (await res.json()) as ApiResponse;
        if (controller.signal.aborted) return;
        dispatch({ type: "success", result: json.result });
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return;
        dispatch({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Stable deps only — arrays serialised above.
  }, [
    enabled,
    tenantSlug,
    controlTextHook,
    controlBody,
    controlVisualSummary,
    attrsKey,
    prevKey,
    newTextHook,
    newBody,
    visualsKey,
    language,
    debounceMs,
  ]);

  return state;
}
