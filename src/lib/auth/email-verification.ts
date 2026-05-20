import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { verifyEmailTemplate } from "@/lib/email/templates/verify-email";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { resolveUserLocale } from "@/lib/i18n/server";

export type VerifyResult =
  | { status: "success"; userId: string }
  | { status: "expired" }
  | { status: "used" }
  | { status: "invalid" };

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function verifyEmailToken(token: string): Promise<VerifyResult> {
  if (!token || token.length < 8) {
    return { status: "invalid" };
  }

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!record) return { status: "invalid" };
  if (record.usedAt) return { status: "used" };
  if (record.expiresAt.getTime() < Date.now()) return { status: "expired" };

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: now },
    }),
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    }),
  ]);

  return { status: "success", userId: record.userId };
}

export async function sendVerificationEmail(userId: string): Promise<
  { ok: true; emailId: string } | { ok: false; error: string }
> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  });
  // If the user row is missing we can't resolve their locale, so use the
  // default — only happens when the session is stale anyway.
  if (!user) {
    const t = await getTranslations({ locale: DEFAULT_LOCALE, namespace: "api.emailVerification" });
    return { ok: false, error: t("userNotFound") };
  }
  const locale = await resolveUserLocale(user.id);
  const t = await getTranslations({ locale, namespace: "api.emailVerification" });
  if (user.emailVerifiedAt) {
    return { ok: false, error: t("alreadyVerified") };
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS);

  await prisma.emailVerificationToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;
  const template = await verifyEmailTemplate({ name: user.name, verifyUrl, locale });

  const result = await sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, emailId: result.id };
}
