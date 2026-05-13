import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brain, BarChart3, Crosshair, Layers, Megaphone, Zap, Check } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "AdsLab · Thai-first SaaS สำหรับมือยิงแอด Meta",
  description:
    "เครื่องมือช่วย media buyer และเอเจนซี่ยิงแอด Meta ได้แม่นและเร็วขึ้น ด้วย AI ภาษาไทย — Dashboard, Audience, Custom Conversions, Customer Journey, Event SDK ครบในที่เดียว",
  openGraph: {
    title: "AdsLab · Thai-first SaaS สำหรับมือยิงแอด Meta",
    description: "ยิงแอดให้เร็ว แม่น scale ได้ — ทดลองฟรี 7 วัน",
    images: ["/adslab-logo.png"],
  },
};

export default async function HomePage() {
  // Logged-in users → straight to their dashboard.
  const session = await getSession();
  if (session.userId) {
    const m = await prisma.tenantMember.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: "asc" },
      select: { tenant: { select: { slug: true } } },
    });
    if (m) redirect(`/t/${m.tenant.slug}/dashboard`);
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-white/80 backdrop-blur dark:bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Image
            src="/adslab-logo.png"
            alt="AdsLab"
            width={400}
            height={120}
            priority
            className="h-8 w-auto dark:brightness-0 dark:invert"
          />
          <nav className="flex items-center gap-3 text-sm">
            <Link href="#pricing" className="hidden text-muted-foreground hover:text-foreground sm:block">
              ราคา
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              เข้าสู่ระบบ
            </Link>
            <Link href="/signup" className={cn(buttonVariants({ size: "sm" }))}>
              เริ่มต้นฟรี 7 วัน
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <div className="mx-auto inline-block rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
            Thai-first · SaaS สำหรับมือยิงแอด Meta
          </div>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
            ยิงแอดให้เร็ว แม่น scale ได้
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            เครื่องมือ optimize Meta ads ด้วย AI ภาษาไทย — Dashboard, Audience, Custom Conversions,
            Customer Journey, Event SDK ทำงานครบในที่เดียว
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className={cn(buttonVariants({ size: "lg" }), "min-w-[200px]")}
            >
              เริ่มต้นฟรี 7 วัน
            </Link>
            <Link
              href="#pricing"
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "min-w-[200px]")}
            >
              ดูแพ็กเกจ
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            ไม่มีค่าสมัคร · ยกเลิกได้ตลอดเวลา · เริ่มเก็บเงินเมื่อหมดทดลอง 7 วัน
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            ครอบคลุมทุกอย่างที่มือยิงแอดต้องการ
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            เริ่มจาก dashboard รวมข้อมูล → AI วิเคราะห์ + แนะนำ → ลงมือเพิ่มประสิทธิภาพ
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={BarChart3}
              title="Unified Dashboard"
              desc="ดู spend / ROAS / CTR / CPM ของทุก ad account ในที่เดียว พร้อม filter ตามช่วงเวลา + ลูกค้า"
            />
            <FeatureCard
              icon={Brain}
              title="AI Master — ผู้ช่วยภาษาไทย"
              desc="สั่งงาน AI ผ่าน chat: ดู insight, pause campaign, ปรับ budget, ค้นข้อมูลจาก knowledge base ของคุณเอง"
            />
            <FeatureCard
              icon={Crosshair}
              title="Audience + Custom Conversions"
              desc="สร้าง Custom/Lookalike audiences + Custom Conversions ตรงจากระบบ ส่งเข้า Meta ทันที"
            />
            <FeatureCard
              icon={Megaphone}
              title="Campaign Builder"
              desc="สร้าง + duplicate campaign แบบมี AI ช่วยตั้งชื่อ + แนะนำ targeting ตามเป้าหมาย"
            />
            <FeatureCard
              icon={Layers}
              title="Event SDK + CAPI"
              desc="ติด Pixel + Conversions API ในคลิกเดียว ครบทุก event type — PixelYourSite-style แต่ภาษาไทย"
            />
            <FeatureCard
              icon={Zap}
              title="Customer Journey Map"
              desc="แผนที่เกาะลอย แสดงเส้นทางลูกค้าจาก ad → page → conversion สวยและเข้าใจง่าย"
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">ราคาตาม ad spend ของคุณ</h2>
          <p className="mt-3 text-center text-muted-foreground">
            จ่ายตามที่คุณใช้จริง · ทุกแพ็กเกจรวม VAT 7% แล้ว · ยกเลิกได้ตลอดเวลา
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <PricingCard
              name="Starter"
              priceThb={1490}
              suitableFor="ad spend < ฿10,000/เดือน"
              bullets={[
                "1 ad account",
                "AI message 30 ข้อความ/วัน",
                "Dashboard + AI Master",
                "Customer Journey",
              ]}
            />
            <PricingCard
              name="Growth"
              priceThb={3890}
              suitableFor="ad spend ฿10k–฿30k/เดือน"
              bullets={[
                "3 ad accounts",
                "AI 100 ข้อความ/วัน",
                "ทุกฟีเจอร์ของ Starter",
                "Custom Conversions",
              ]}
              recommended
            />
            <PricingCard
              name="Pro"
              priceThb={10990}
              suitableFor="ad spend ฿30k–฿100k/เดือน"
              bullets={[
                "10 ad accounts",
                "AI 300 ข้อความ/วัน",
                "ทุกฟีเจอร์ของ Growth",
                "Audience Management",
              ]}
            />
            <PricingCard
              name="Scale"
              priceThb={44990}
              suitableFor="ad spend ฿100k–฿500k/เดือน"
              bullets={[
                "25 ad accounts",
                "AI ไม่จำกัด",
                "White-label Reports ฟรี",
                "Priority Support",
              ]}
            />
          </div>

          <div className="mt-12 rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold">Add-ons (เปิด/ปิดได้ทุก tier)</h3>
            <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <li className="flex items-baseline gap-2">
                <span className="text-cyan-600">·</span>
                <span><b>Event SDK + Pixel Tracking</b> — ฿590/เดือน</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-cyan-600">·</span>
                <span><b>Extra Ad Account</b> — ฿190/account/เดือน</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-cyan-600">·</span>
                <span><b>White-label Reports</b> — ฿490/เดือน (ฟรีสำหรับ Scale+)</span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="text-cyan-600">·</span>
                <span><b>Priority AI (Claude Opus)</b> — ฿890/เดือน</span>
              </li>
            </ul>
            <p className="mt-5 text-xs text-muted-foreground">
              ad spend &gt; ฿1,000,000/เดือน? <Link href="/contact" className="text-cyan-600 hover:underline">ติดต่อทีมขาย</Link> สำหรับแพ็กเกจ Enterprise
            </p>
          </div>

          <div className="mt-12 rounded-xl border border-cyan-200 bg-cyan-50 p-6 text-sm dark:border-cyan-900 dark:bg-cyan-950/30">
            <h3 className="font-semibold text-cyan-900 dark:text-cyan-100">การชำระเงิน + คืนเงิน</h3>
            <ul className="mt-3 space-y-1 text-cyan-900 dark:text-cyan-100">
              <li>✓ ทดลองใช้ฟรี 7 วัน — บันทึกบัตรเครดิตล่วงหน้า, ไม่มีการเรียกเก็บระหว่างทดลอง</li>
              <li>✓ เริ่มเก็บเงินอัตโนมัติในวันที่ 8 ถ้าไม่ได้ยกเลิก (มีอีเมลเตือนล่วงหน้า 3 ครั้ง)</li>
              <li>✓ ขอคืนเงินภายใน 7 วันแรกของรอบบิล — คืนตามสัดส่วน (pro-rated)</li>
              <li>✓ ยกเลิกการต่ออายุได้ตลอดเวลา · ใช้งานต่อได้จนสิ้นรอบบิล</li>
              <li>✓ ชำระผ่าน Omise (PCI DSS Level 1) · รองรับ Visa, Mastercard, JCB, AMEX</li>
            </ul>
            <p className="mt-4 text-xs">
              อ่านรายละเอียดเพิ่มที่ <Link href="/refund-policy" className="font-semibold underline-offset-2 hover:underline">นโยบายการคืนเงิน</Link>
              {" · "}<Link href="/terms" className="font-semibold underline-offset-2 hover:underline">ข้อกำหนดการใช้บริการ</Link>
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">พร้อมยิงแอดให้คม?</h2>
          <p className="mt-3 text-muted-foreground">
            สมัครฟรี 7 วัน · ไม่มีค่าสมัคร · ยกเลิกได้ตลอด
          </p>
          <Link
            href="/signup"
            className={cn(buttonVariants({ size: "lg" }), "mt-8 min-w-[240px]")}
          >
            เริ่มต้นฟรี 7 วัน
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 transition-all hover:border-cyan-300 hover:shadow-sm">
      <div className="flex size-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function PricingCard({
  name,
  priceThb,
  suitableFor,
  bullets,
  recommended,
}: {
  name: string;
  priceThb: number;
  suitableFor: string;
  bullets: string[];
  recommended?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card p-6",
        recommended ? "border-cyan-500 shadow-md" : "border-border",
      )}
    >
      {recommended && (
        <span className="absolute -top-2 left-4 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-semibold text-white">
          แนะนำ
        </span>
      )}
      <p className="text-lg font-bold">{name}</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight">
        ฿{priceThb.toLocaleString("th-TH")}
        <span className="ml-1 text-sm font-normal text-muted-foreground">/เดือน</span>
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{suitableFor}</p>
      <ul className="mt-4 space-y-1.5 text-xs">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5">
            <Check className="mt-0.5 size-3 shrink-0 text-cyan-600" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
