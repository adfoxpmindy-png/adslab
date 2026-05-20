import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { resolveUniqueSlug } from "@/lib/utils/slug";
import { sendEmail } from "@/lib/email/send";
import { verifyEmailTemplate } from "@/lib/email/templates/verify-email";
import { resolveActiveLocale, resolveUserLocale } from "@/lib/i18n/server";

export async function POST(request: NextRequest) {
  // Pre-resolve translations using the active locale cookie so validation
  // errors come back in the visitor's chosen language (signup happens
  // before a user record exists, so resolveUserLocale isn't available).
  const activeLocale = await resolveActiveLocale();
  const t = await getTranslations({
    locale: activeLocale,
    namespace: "api.auth.signup",
  });

  const signupSchema = z.object({
    email: z.email(t("invalidEmail")),
    password: z.string().min(8, t("passwordTooShort")),
    name: z.string().min(2, t("nameTooShort")).max(64),
    tenantName: z.string().min(2, t("tenantNameTooShort")).max(64),
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { error: t("invalidPayload"), fieldErrors },
      { status: 400 },
    );
  }

  const { email, password, name, tenantName } = parsed.data;
  const emailLower = email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: emailLower },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: t("emailTaken"),
        fieldErrors: { email: t("emailTaken") },
      },
      { status: 409 },
    );
  }

  const slug = await resolveUniqueSlug(tenantName, async (candidate) => {
    const exists = await prisma.tenant.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    return !exists;
  });

  const passwordHash = await hashPassword(password);
  const verificationToken = randomUUID();
  const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const { user, tenant } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: emailLower, passwordHash, name },
    });
    const tenant = await tx.tenant.create({
      data: { name: tenantName, slug },
    });
    await tx.tenantMember.create({
      data: { userId: user.id, tenantId: tenant.id, role: "OWNER" },
    });
    await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expiresAt: tokenExpiresAt,
      },
    });
    return { user, tenant };
  });

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  await session.save();

  // Send verification email — best effort, don't block signup.
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const verifyUrl = `${appUrl}/verify-email?token=${verificationToken}`;
  const locale = await resolveUserLocale(user.id);
  const template = await verifyEmailTemplate({ name, verifyUrl, locale });
  const emailResult = await sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
  if (!emailResult.ok) {
    console.error("[signup] verification email failed:", emailResult.error);
  }

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: false,
      },
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    },
    { status: 201 },
  );
}
