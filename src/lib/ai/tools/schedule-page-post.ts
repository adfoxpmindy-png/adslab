import { z } from "zod";

import { schedulePagePost } from "@/lib/meta/page-posts";
import { defineTool } from "./types";

const inputSchema = z.object({
  pageId: z
    .string()
    .describe(
      "Meta page id (digit string) the post should be published TO. Get it from the user or via the page picker — never invent.",
    ),
  caption: z
    .string()
    .min(1)
    .max(5000)
    .describe("The post caption (Thai or English). Will appear exactly as written on Facebook."),
  mediaUrls: z
    .array(z.string().url())
    .min(1)
    .max(10)
    .describe(
      "Public HTTPS URLs of the images/video. Use Vercel Blob URLs (from /api/posts/upload) or other publicly reachable URLs.",
    ),
  scheduledAt: z
    .string()
    .describe("ISO 8601 datetime when the post should be published. Must be ≥ 10 min and ≤ 6 months from now."),
});

export const schedulePagePostTool = defineTool({
  name: "schedulePagePost",
  description:
    "Schedule an organic Facebook page post (not a paid ad). Use this when the user wants to publish a regular post to a Facebook page at a specific future time. Meta handles publishing natively — no cron needed. Mutate action: user will see a confirmation card with the full caption + scheduled time before it's committed.",
  kind: "mutate",
  inputSchema,
  jsonSchema: {
    type: "object",
    properties: {
      pageId: { type: "string", description: "Meta page id (digit string)." },
      caption: { type: "string", description: "Post caption (≤ 5000 chars)." },
      mediaUrls: {
        type: "array",
        items: { type: "string" },
        description: "Public HTTPS URLs of media (1-10 images OR 1 video).",
      },
      scheduledAt: {
        type: "string",
        description: "ISO 8601 datetime for publication.",
      },
    },
    required: ["pageId", "caption", "mediaUrls", "scheduledAt"],
    additionalProperties: false,
  },
  summarize: (input) => {
    const when = new Date(input.scheduledAt).toLocaleString("th-TH", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const snippet = input.caption.slice(0, 60).replace(/\n/g, " ");
    return `ตั้งเวลาโพสต์เพจ ${input.pageId} วัน ${when}: "${snippet}..."`;
  },
  async handler(input, ctx) {
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return { error: "scheduledAt ไม่ใช่ ISO datetime ที่ถูกต้อง" };
    }
    const result = await schedulePagePost({
      tenantId: ctx.tenantId,
      metaPageId: input.pageId,
      caption: input.caption,
      mediaUrls: input.mediaUrls,
      scheduledAt,
      createdByUserId: ctx.userId,
      conversationId: ctx.conversationId,
    });
    if (!result.ok) return { error: result.error, pagePostId: result.pagePostId };
    return {
      ok: true,
      pagePostId: result.pagePostId,
      metaPostId: result.metaPostId,
      scheduledAt: input.scheduledAt,
    };
  },
});
