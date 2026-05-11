import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { sendVerificationEmail } from "@/lib/auth/email-verification";

export async function POST() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  }

  const result = await sendVerificationEmail(session.userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
