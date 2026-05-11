import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { verifyEmailToken, type VerifyResult } from "@/lib/auth/email-verification";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

import { ResendButton } from "./resend-button";

type SearchParams = Promise<{ token?: string }>;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token } = await searchParams;

  let result: VerifyResult;
  if (!token) {
    result = { status: "invalid" };
  } else {
    result = await verifyEmailToken(token);
  }

  const session = await getSession();
  const isLoggedIn = Boolean(session.userId);

  // Determine where "Go to dashboard" should point: the user's first tenant.
  let dashboardHref: string | null = null;
  if (result.status === "success") {
    const member = await prisma.tenantMember.findFirst({
      where: { userId: result.userId },
      orderBy: { createdAt: "asc" },
      select: { tenant: { select: { slug: true } } },
    });
    if (member) dashboardHref = `/t/${member.tenant.slug}/dashboard`;
  } else if (isLoggedIn) {
    const member = await prisma.tenantMember.findFirst({
      where: { userId: session.userId! },
      orderBy: { createdAt: "asc" },
      select: { tenant: { select: { slug: true } } },
    });
    if (member) dashboardHref = `/t/${member.tenant.slug}/dashboard`;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">AdsLab</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{titleFor(result.status)}</CardTitle>
            <CardDescription>{descriptionFor(result.status)}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {result.status === "success" && dashboardHref && (
              <Link
                href={dashboardHref}
                className={cn(buttonVariants({ size: "lg" }), "w-full")}
              >
                ไปที่แดชบอร์ด
              </Link>
            )}

            {(result.status === "expired" || result.status === "invalid") && isLoggedIn && (
              <ResendButton />
            )}

            {!isLoggedIn && result.status !== "success" && (
              <div className="space-y-3">
                <p className="text-center text-sm text-muted-foreground">
                  กรุณาเข้าสู่ระบบเพื่อขอเมลยืนยันใหม่
                </p>
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
                >
                  เข้าสู่ระบบ
                </Link>
              </div>
            )}

            {result.status === "used" && (
              <p className="text-center text-sm text-muted-foreground">
                คุณสามารถ
                <Link
                  href={dashboardHref ?? "/login"}
                  className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
                >
                  เข้าสู่แดชบอร์ด
                </Link>
                {" "}ได้เลย
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function titleFor(status: VerifyResult["status"]): string {
  switch (status) {
    case "success":
      return "ยืนยันอีเมลสำเร็จ ✓";
    case "used":
      return "อีเมลถูกยืนยันแล้ว";
    case "expired":
      return "ลิงก์หมดอายุ";
    case "invalid":
    default:
      return "ลิงก์ไม่ถูกต้อง";
  }
}

function descriptionFor(status: VerifyResult["status"]): string {
  switch (status) {
    case "success":
      return "ขอบคุณที่ยืนยันอีเมล — บัญชีของคุณพร้อมใช้งานแล้ว";
    case "used":
      return "ลิงก์ยืนยันนี้ถูกใช้งานไปแล้ว";
    case "expired":
      return "ลิงก์ยืนยันมีอายุ 24 ชั่วโมง — กรุณาขอเมลใหม่";
    case "invalid":
    default:
      return "ไม่พบลิงก์ยืนยันที่ตรงกัน หรือลิงก์อาจเสียหาย";
  }
}
