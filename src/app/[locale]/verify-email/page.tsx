import Image from "next/image";
import { Link } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("pages.verifyEmail");

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

  function titleFor(status: VerifyResult["status"]): string {
    switch (status) {
      case "success":
        return t("titleSuccess");
      case "used":
        return t("titleUsed");
      case "expired":
        return t("titleExpired");
      case "invalid":
      default:
        return t("titleInvalid");
    }
  }

  function descriptionFor(status: VerifyResult["status"]): string {
    switch (status) {
      case "success":
        return t("descSuccess");
      case "used":
        return t("descUsed");
      case "expired":
        return t("descExpired");
      case "invalid":
      default:
        return t("descInvalid");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/adslab-logo.png"
            alt="AdsLab"
            width={400}
            height={120}
            priority
            className="h-12 w-auto dark:brightness-0 dark:invert"
          />
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
                {t("goToDashboard")}
              </Link>
            )}

            {(result.status === "expired" || result.status === "invalid") && isLoggedIn && (
              <ResendButton />
            )}

            {!isLoggedIn && result.status !== "success" && (
              <div className="space-y-3">
                <p className="text-center text-sm text-muted-foreground">
                  {t("loginPrompt")}
                </p>
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
                >
                  {t("loginBtn")}
                </Link>
              </div>
            )}

            {result.status === "used" && (
              <p className="text-center text-sm text-muted-foreground">
                {t("usedPrefix")}
                <Link
                  href={dashboardHref ?? "/login"}
                  className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {t("usedLink")}
                </Link>
                {" "}{t("usedSuffix")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
