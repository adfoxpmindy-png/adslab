"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import Image from "next/image";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LegalFooter } from "@/components/legal-footer";
import { SiteFooter } from "@/components/site-footer";

type FieldErrors = Partial<Record<"name" | "email" | "password" | "tenantName", string>>;

export default function SignupPage() {
  const t = useTranslations("pages.signup");
  const router = useRouter();
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
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      tenantName: String(formData.get("tenantName") ?? "").trim(),
    };

    try {
      const res = await fetch("/api/auth/signup", {
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

      router.push(`/t/${data.tenant.slug}/insights`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setFormError(t("errors.serverUnreachable"));
      setPending(false);
    }
  }

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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">{t("nameLabel")}</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  disabled={pending}
                  placeholder={t("namePlaceholder")}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-destructive">{fieldErrors.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tenantName">{t("tenantLabel")}</Label>
                <Input
                  id="tenantName"
                  name="tenantName"
                  type="text"
                  required
                  disabled={pending}
                  placeholder={t("tenantPlaceholder")}
                />
                {fieldErrors.tenantName && (
                  <p className="text-xs text-destructive">{fieldErrors.tenantName}</p>
                )}
              </div>

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
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={pending}
                  placeholder={t("passwordPlaceholder")}
                />
                {fieldErrors.password && (
                  <p className="text-xs text-destructive">{fieldErrors.password}</p>
                )}
              </div>

              {formError && !Object.keys(fieldErrors).length && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t("submitting") : t("submit")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("login")}
          </Link>
        </p>
        <LegalFooter />
      </div>
    </main>
    <SiteFooter />
    </div>
  );
}
