"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LegalFooter } from "@/components/legal-footer";
import { SiteFooter } from "@/components/site-footer";

type FieldErrors = Partial<Record<"name" | "email" | "password" | "tenantName", string>>;

export default function SignupPage() {
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
        setFormError(data.error ?? "เกิดข้อผิดพลาด");
        setPending(false);
        return;
      }

      router.push(`/t/${data.tenant.slug}/dashboard`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setFormError("เชื่อมต่อ server ไม่ได้ ลองอีกครั้ง");
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
            ยิงแอดให้เร็ว แม่น scale ได้
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">สมัครสมาชิก</CardTitle>
            <CardDescription>เริ่มใช้งานฟรี 30 วัน</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">ชื่อของคุณ</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  disabled={pending}
                  placeholder="เช่น อินดี้"
                />
                {fieldErrors.name && (
                  <p className="text-xs text-destructive">{fieldErrors.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tenantName">ชื่อ Agency / Workspace</Label>
                <Input
                  id="tenantName"
                  name="tenantName"
                  type="text"
                  required
                  disabled={pending}
                  placeholder="เช่น My Agency"
                />
                {fieldErrors.tenantName && (
                  <p className="text-xs text-destructive">{fieldErrors.tenantName}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">อีเมล</Label>
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
                <Label htmlFor="password">รหัสผ่าน</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={pending}
                  placeholder="อย่างน้อย 8 ตัวอักษร"
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
                {pending ? "กำลังสมัคร..." : "สมัครสมาชิก"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          มีบัญชีอยู่แล้ว?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
        <LegalFooter />
      </div>
    </main>
    <SiteFooter />
    </div>
  );
}
