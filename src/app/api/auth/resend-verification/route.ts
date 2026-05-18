import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { getSession } from "@/lib/auth/session";
import { sendVerificationEmail } from "@/lib/auth/email-verification";
import { resolveActiveLocale } from "@/lib/i18n/server";

export async function POST() {
  const session = await getSession();
  if (!session.userId) {
    const locale = await resolveActiveLocale();
    const t = await getTranslations({ locale, namespace: "api.auth" });
    return NextResponse.json({ error: t("unauthorized") }, { status: 401 });
  }

  const result = await sendVerificationEmail(session.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
