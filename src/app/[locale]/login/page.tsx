"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/routing";
import { Suspense } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LegalFooter } from "@/components/legal-footer";
import { SiteFooter } from "@/components/site-footer";

type FieldErrors = Partial<Record<"email" | "password", string>>;

function LoginForm() {
  const t = useTranslations("pages.login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
    };

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setFormError(data.error ?? t("errors.generic"));
        setPending(false);
        return;
      }

      router.push(next ?? data.redirectTo ?? "/");
      router.refresh();
    } catch (err) {
      console.error(err);
      setFormError(t("errors.serverUnreachable"));
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("emailLabel")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          placeholder="you@example.com"
        />
        {fieldErrors.email && (
          <p className="text-xs text-destructive">{fieldErrors.email}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t("passwordLabel")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
        {fieldErrors.password && (
          <p className="text-xs text-destructive">{fieldErrors.password}</p>
        )}
      </div>

      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  const t = useTranslations("pages.login");
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/adslab-logo.png"
            alt="AdsLab"
            width={400}
            height={120}
            priority
            className="h-12 w-auto dark:brightness-0 dark:invert"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            {t("tagline")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>

          <CardContent>
            <Suspense fallback={<div className="h-64" />}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("signup")}
          </Link>
        </p>
        <LegalFooter />
      </div>
    </main>
    <SiteFooter />
    </div>
  );
}
