import { listCampaignsTool } from "./list-campaigns";
import { getCampaignInsightsTool } from "./get-campaign-insights";
import { pauseCampaignTool } from "./pause-campaign";
import { resumeCampaignTool } from "./resume-campaign";
import { setCampaignBudgetTool } from "./set-campaign-budget";
import { searchKnowledgeTool } from "./search-knowledge";
import { analyzeAdCreativeTool } from "./analyze-ad-creative";
import { pauseAdSetTool } from "./pause-adset";
import { resumeAdSetTool } from "./resume-adset";
import { pauseAdTool } from "./pause-ad";
import { setAdSetBudgetTool } from "./set-adset-budget";
import { duplicateCampaignTool } from "./duplicate-campaign";
import type { ToolDef } from "./types";

/**
 * Central tool registry. Adding a tool here makes it available to the AI
 * in every chat. Order doesn't matter to the model but we keep it
 * grouped: read tools first, mutate tools last (for code review clarity).
 */
const TOOLS: ToolDef[] = [
  // ---- READ ----
  listCampaignsTool as unknown as ToolDef,
  getCampaignInsightsTool as unknown as ToolDef,
  searchKnowledgeTool as unknown as ToolDef,
  analyzeAdCreativeTool as unknown as ToolDef,
  // ---- MUTATE ----
  pauseCampaignTool as unknown as ToolDef,
  resumeCampaignTool as unknown as ToolDef,
  setCampaignBudgetTool as unknown as ToolDef,
  pauseAdSetTool as unknown as ToolDef,
  resumeAdSetTool as unknown as ToolDef,
  pauseAdTool as unknown as ToolDef,
  setAdSetBudgetTool as unknown as ToolDef,
  duplicateCampaignTool as unknown as ToolDef,
];

export function getAllTools(): ToolDef[] {
  return TOOLS;
}

export function getToolByName(name: string): ToolDef | null {
  return TOOLS.find((t) => t.name === name) ?? null;
}

/** Serialize tools into the OpenAI tool-calling format that OpenRouter accepts. */
export function toolsForApi(): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.jsonSchema,
    },
  }));
}
