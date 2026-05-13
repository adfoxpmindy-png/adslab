/**
 * Usage metering. Called after every successful AI exchange to
 * increment the per-tenant per-day counter. Used by the gate.
 */

import { prisma } from "@/lib/prisma";

function startOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export async function recordAiUsage(opts: {
  tenantId: string;
  inputTokens: number;
  outputTokens: number;
  messageCount?: number;
}): Promise<void> {
  const date = startOfDayUtc(new Date());
  await prisma.usageMetric.upsert({
    where: { tenantId_date: { tenantId: opts.tenantId, date } },
    create: {
      tenantId: opts.tenantId,
      date,
      aiMessagesCount: opts.messageCount ?? 1,
      aiInputTokens: BigInt(opts.inputTokens),
      aiOutputTokens: BigInt(opts.outputTokens),
      adSpendThb: 0,
    },
    update: {
      aiMessagesCount: { increment: opts.messageCount ?? 1 },
      aiInputTokens: { increment: BigInt(opts.inputTokens) },
      aiOutputTokens: { increment: BigInt(opts.outputTokens) },
    },
  });
}
