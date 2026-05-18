/**
 * analyzeAdCreative — AI tool that fetches an ad's visual asset
 * (image / thumbnail / video poster) from Meta and runs a vision LLM
 * to evaluate hook strength, visual hierarchy, text legibility, etc.
 *
 * Results are cached on MetaAd.creativeAnalysis for 7 days so repeated
 * diagnoses of the same ad don't re-bill the vision API. A soft per-
 * tenant daily quota prevents runaway cost.
 */
import OpenAI from "openai";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { graphFetch } from "@/lib/meta/graph-api";
import { getConnection, getFreshAccessToken } from "@/lib/meta/client";
import { getAiModel } from "@/lib/ai/openrouter";
import { resolveUserLocale } from "@/lib/i18n/server";
import { localeDirective } from "@/lib/i18n/prompt";

import { defineTool } from "./types";

const DAILY_QUOTA = 50;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const inputSchema = z.object({
  adId: z.string().min(1).describe("Meta numeric ad id (digit string)."),
});

function buildVisionSystemPrompt(localeInstruction: string): string {
  return `You analyze Facebook/Instagram ad creatives for an SE-Asia media-buying platform.

${localeInstruction}

Return ONLY a valid JSON object (no prose, no fences) with this shape:

{
  "hook": string,              // 1-sentence summary of the visual/text hook
  "visualHierarchy": 1-5,      // Focal-point clarity (5 = crisp)
  "textLegibility": 1-5,       // On-screen text mobile readability (5 = easy)
  "emotionalTone": string,     // e.g. luxurious/trustworthy, calm, urgent, warm
  "dominantColor": string,     // e.g. warm orange, deep blue, pastel pink
  "strengths": string[],       // 2-4 short bullets
  "weaknesses": string[],      // 1-3 specific issues
  "suggestedFixes": string[]   // 2-3 concrete actionable rewrites — avoid soft hedges
}

Style: direct, professional media-buyer voice, specific > generic.`;
}

type VisionResult = {
  hook: string;
  visualHierarchy: number;
  textLegibility: number;
  emotionalTone: string;
  dominantColor: string;
  strengths: string[];
  weaknesses: string[];
  suggestedFixes: string[];
};

export const analyzeAdCreativeTool = defineTool({
  name: "analyzeAdCreative",
  description:
    "Look at an ad's actual image/video creative (not just metrics) and return a structured visual evaluation. Use this when diagnosing why a specific ad underperforms, or when the user asks about a specific ad's creative quality. DO NOT call speculatively for every ad in a list — only when narrowing in on an underperformer or a specific ad the user named. Cached 7 days per ad.",
  kind: "read",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      adId: { type: "string", description: "Meta ad id (digit string)." },
    },
    required: ["adId"],
    additionalProperties: false,
  },
  summarize: (input) => `Analyze creative for ad ${input.adId}`,
  async handler(input, ctx) {
    // 1. Cache check — look up the ad row in our DB.
    const adRow = await prisma.metaAd.findUnique({
      where: { metaAdId: input.adId },
      select: {
        creativeAnalysis: true,
        creativeAnalyzedAt: true,
        creativeId: true,
      },
    });
    if (
      adRow?.creativeAnalysis &&
      adRow.creativeAnalyzedAt &&
      Date.now() - adRow.creativeAnalyzedAt.getTime() < CACHE_TTL_MS
    ) {
      return {
        cached: true,
        cachedAt: adRow.creativeAnalyzedAt.toISOString(),
        analysis: adRow.creativeAnalysis,
      };
    }

    // 2. Quota check — count vision-analyzed ads under this tenant today.
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const todayCount = await prisma.metaAd.count({
      where: {
        creativeAnalyzedAt: { gte: since },
        adSet: {
          campaign: {
            connection: { tenantId: ctx.tenantId },
          },
        },
      },
    });
    if (todayCount >= DAILY_QUOTA) {
      return {
        error: "quota_exceeded",
        limit: DAILY_QUOTA,
        resetsAt: "00:00 UTC next day",
        message: "Tenant has used the daily vision-call quota — fall back to analyzing metrics and user prompt instead",
      };
    }

    // 3. Resolve visual URL via Meta API
    const connection = await getConnection(ctx.tenantId);
    if (!connection || connection.status !== "ACTIVE") {
      return { error: "no_meta_connection" };
    }
    const accessToken = await getFreshAccessToken(connection);
    let imageUrl: string | null = null;
    try {
      const ad = await graphFetch<{
        creative?: {
          thumbnail_url?: string;
          image_url?: string;
          video_id?: string;
        };
      }>(`/${input.adId}`, {
        accessToken,
        searchParams: {
          fields: "creative{thumbnail_url,image_url,video_id}",
        },
      });
      imageUrl = ad.creative?.image_url ?? ad.creative?.thumbnail_url ?? null;
      // If no static asset but there's a video_id, fetch its thumbnail.
      if (!imageUrl && ad.creative?.video_id) {
        const thumbs = await graphFetch<{
          data?: Array<{ uri: string; is_preferred?: boolean }>;
        }>(`/${ad.creative.video_id}/thumbnails`, { accessToken });
        const preferred = thumbs.data?.find((t) => t.is_preferred) ?? thumbs.data?.[0];
        imageUrl = preferred?.uri ?? null;
      }
    } catch (err) {
      return {
        error: "fetch_creative_failed",
        message: (err as Error).message.slice(0, 200),
      };
    }
    if (!imageUrl) {
      return {
        error: "no_visual_asset",
        message: "This ad has no image_url, thumbnail_url, or video thumbnail",
      };
    }

    // 4. Vision call. Bypass aiChat wrapper because it doesn't currently
    //    support image content — direct OpenRouter call instead.
    let analysis: VisionResult | null = null;
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return { error: "openrouter_key_missing" };
      }
      const client = new OpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      const model = getAiModel("analysis");
      const locale = await resolveUserLocale(ctx.userId);
      const completion = await client.chat.completions.create({
        model,
        max_tokens: 800,
        messages: [
          { role: "system", content: buildVisionSystemPrompt(localeDirective(locale)) },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this ad creative:" },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      analysis = JSON.parse(cleaned) as VisionResult;
    } catch (err) {
      return {
        error: "vision_call_failed",
        message: (err as Error).message.slice(0, 200),
      };
    }

    // 5. Cache result on MetaAd row
    await prisma.metaAd.update({
      where: { metaAdId: input.adId },
      data: {
        creativeAnalysis: analysis as unknown as object,
        creativeAnalyzedAt: new Date(),
      },
    }).catch(() => {
      // If the ad isn't in our DB (rare), silently skip caching.
    });

    return {
      cached: false,
      analysis,
    };
  },
});
