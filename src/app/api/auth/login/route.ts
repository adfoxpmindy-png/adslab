import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { COOKIE_NAME as LOCALE_COOKIE } from "@/i18n/request";

const loginSchema = z.object({
  email: z.email("รูปแบบอีเมลไม่ถูกต้อง"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { error: "ข้อมูลไม่ถูกต้อง", fieldErrors },
      { status: 400 },
    );
  }

  const emailLower = parsed.data.email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: emailLower },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      emailVerifiedAt: true,
      preferredLocale: true,
      memberships: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { tenant: { select: { slug: true } } },
      },
    },
  });

  const genericError = NextResponse.json(
    { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
    { status: 401 },
  );

  if (!user) return genericError;

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return genericError;

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  await session.save();

  const firstTenantSlug = user.memberships[0]?.tenant.slug ?? null;
  const redirectTo = firstTenantSlug ? `/t/${firstTenantSlug}/dashboard` : "/";

  const userLocale = isLocale(user.preferredLocale) ? user.preferredLocale : DEFAULT_LOCALE;
  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
    redirectTo,
  });
  // 1 year — same lifetime as the session itself; user can change anytime.
  res.cookies.set(LOCALE_COOKIE, userLocale, {
    maxAge: 365 * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
  });
  return res;
}
