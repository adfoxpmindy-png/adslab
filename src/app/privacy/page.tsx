import Link from "next/link";
import type { Metadata } from "next";

import { SiteFooter } from "@/components/site-footer";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Privacy Policy / นโยบายความเป็นส่วนตัว · AdsLab",
  description: "How AdsLab collects, uses, and protects your data.",
};

const LAST_UPDATED = "2026-05-11";
const CONTACT_EMAIL = COMPANY.supportEmail;

export default function PrivacyPage() {
  return (
    <>
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← AdsLab
        </Link>
      </div>

      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy / นโยบายความเป็นส่วนตัว</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated / อัปเดตล่าสุด: {LAST_UPDATED}</p>
      </header>

      {/* ============== Thai version (primary market) ============== */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">ภาษาไทย</h2>

        <Block title="1. บทนำ">
          AdsLab (&quot;เรา&quot;) เป็นแพลตฟอร์ม SaaS สำหรับ media buyer และ digital marketing agency
          นโยบายฉบับนี้อธิบายวิธีที่เราเก็บ ใช้ และคุ้มครองข้อมูลของคุณตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
          และมาตรฐานสากล (GDPR)
        </Block>

        <Block title="2. ข้อมูลที่เราเก็บ">
          <ul className="ml-6 list-disc space-y-1.5">
            <li><strong>ข้อมูลบัญชี:</strong> อีเมล, ชื่อ, รหัสผ่าน (เก็บแบบ hash)</li>
            <li><strong>ข้อมูลองค์กร (Workspace):</strong> ชื่อ Agency, ทีมงาน, role ของแต่ละสมาชิก</li>
            <li><strong>ข้อมูลโฆษณา Meta:</strong> เมื่อคุณกด &quot;Connect Meta&quot; เราดึงข้อมูล ad accounts, campaigns, insights ผ่าน Meta Marketing API ตามสิทธิ์ที่คุณอนุญาต</li>
            <li><strong>ข้อมูลการใช้งาน:</strong> log การล็อกอิน, การเรียก API, error events</li>
            <li><strong>Cookies:</strong> session cookie สำหรับการยืนยันตัวตนเท่านั้น ไม่มี tracking cookies</li>
          </ul>
        </Block>

        <Block title="3. เราใช้ข้อมูลของคุณอย่างไร">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>ให้บริการแพลตฟอร์ม (dashboard, AI report, optimization)</li>
            <li>ส่งอีเมลที่จำเป็น (verify, password reset, รายงาน)</li>
            <li>สร้าง AI insights ผ่าน OpenRouter (Claude, Gemini) — ข้อมูล campaign ของคุณถูกส่งไปประมวลผลและไม่ถูกเก็บไว้ที่ผู้ให้บริการ AI</li>
            <li>ปรับปรุงคุณภาพบริการ (ข้อมูลรวม anonymized)</li>
          </ul>
          <p className="mt-3"><strong>เราไม่:</strong> ขาย, แบ่งปันให้ผู้โฆษณา, หรือใช้ข้อมูลคุณเพื่อฝึก AI model</p>
        </Block>

        <Block title="4. ผู้ให้บริการบุคคลที่สาม">
          <ul className="ml-6 list-disc space-y-1.5">
            <li><strong>Meta Platforms</strong> — แหล่งข้อมูลโฆษณา (ผ่าน Marketing API)</li>
            <li><strong>OpenRouter / Anthropic / Google</strong> — ประมวลผล AI</li>
            <li><strong>Resend</strong> — ส่งอีเมล</li>
            <li><strong>Vercel</strong> — โฮสติ้ง (เซิร์ฟเวอร์ในประเทศที่อยู่ใกล้ผู้ใช้)</li>
            <li><strong>Neon</strong> — ฐานข้อมูล (ภูมิภาค Singapore)</li>
            <li><strong>Omise</strong> (Phase 2) — ประมวลผลการชำระเงิน</li>
          </ul>
        </Block>

        <Block title="5. ระยะเวลาเก็บข้อมูล">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>ข้อมูลบัญชี: ตลอดอายุการใช้งาน + 90 วันหลังลบบัญชี</li>
            <li>ข้อมูลโฆษณา cache: สูงสุด 90 วันสำหรับการแสดงผลย้อนหลัง</li>
            <li>Log: 30 วัน</li>
            <li>หลังหมดเวลา ข้อมูลถูกลบถาวรจาก backup</li>
          </ul>
        </Block>

        <Block title="6. สิทธิของคุณ (PDPA / GDPR)">
          <p>คุณมีสิทธิที่จะ:</p>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>เข้าถึงและดาวน์โหลดข้อมูลของคุณ</li>
            <li>แก้ไขข้อมูลที่ไม่ถูกต้อง</li>
            <li>ลบบัญชีและข้อมูลทั้งหมด (ดูหน้า <Link className="text-primary underline-offset-4 hover:underline" href="/data-deletion">Data Deletion</Link>)</li>
            <li>ถอนความยินยอม (disconnect Meta ได้ทุกเมื่อ)</li>
            <li>โอนย้ายข้อมูล (data portability)</li>
            <li>ร้องเรียนต่อสำนักงานคุ้มครองข้อมูลส่วนบุคคล (PDPC) หากเห็นว่าเราละเมิด</li>
          </ul>
          <p className="mt-3">ติดต่อ: <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
        </Block>

        <Block title="7. ความปลอดภัย">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>การส่งข้อมูลทุกครั้งเข้ารหัสด้วย TLS (HTTPS)</li>
            <li>รหัสผ่านเก็บแบบ bcrypt hash (ไม่สามารถถอดกลับได้)</li>
            <li>Meta access token เก็บแบบ AES-256-GCM encrypted ในฐานข้อมูล</li>
            <li>Session cookie เป็นแบบ httpOnly, secure, sameSite=lax</li>
          </ul>
        </Block>

        <Block title="8. การเปลี่ยนแปลงนโยบาย">
          เราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว การเปลี่ยนแปลงที่สำคัญจะแจ้งทางอีเมล อย่างน้อย 14 วันก่อนมีผล
        </Block>

        <Block title="9. ติดต่อเรา">
          อีเมล: <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </Block>
      </section>

      <hr className="my-12 border-border" />

      {/* ============== English version (for Meta reviewers + intl users) ============== */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">English</h2>

        <Block title="1. Introduction">
          AdsLab (&quot;we&quot;, &quot;our&quot;) is a SaaS platform for media buyers and digital marketing agencies.
          This policy explains how we collect, use, and protect your data in compliance with Thailand&apos;s
          Personal Data Protection Act (PDPA, 2019) and international standards including GDPR.
        </Block>

        <Block title="2. Information We Collect">
          <ul className="ml-6 list-disc space-y-1.5">
            <li><strong>Account info:</strong> email, name, password (stored as bcrypt hash)</li>
            <li><strong>Workspace info:</strong> agency name, team members, roles</li>
            <li><strong>Meta advertising data:</strong> when you click &quot;Connect Meta&quot; we fetch your ad accounts, campaigns, and insights via Meta Marketing API based on permissions you grant</li>
            <li><strong>Usage data:</strong> login logs, API call logs, error events</li>
            <li><strong>Cookies:</strong> session cookie only (authentication). No tracking cookies.</li>
          </ul>
        </Block>

        <Block title="3. How We Use Your Information">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>Provide the platform (dashboard, AI report, optimization)</li>
            <li>Send required emails (verification, password reset, reports)</li>
            <li>Generate AI insights via OpenRouter (Claude, Gemini) — your campaign data is sent for processing and is NOT retained by the AI providers</li>
            <li>Improve service quality (aggregated, anonymized data)</li>
          </ul>
          <p className="mt-3"><strong>We do NOT:</strong> sell your data, share with advertisers, or use your data to train AI models.</p>
        </Block>

        <Block title="4. Third-Party Service Providers">
          <ul className="ml-6 list-disc space-y-1.5">
            <li><strong>Meta Platforms</strong> — advertising data source (via Marketing API)</li>
            <li><strong>OpenRouter / Anthropic / Google</strong> — AI processing</li>
            <li><strong>Resend</strong> — email delivery</li>
            <li><strong>Vercel</strong> — hosting (edge network)</li>
            <li><strong>Neon</strong> — database (Singapore region)</li>
            <li><strong>Omise</strong> (Phase 2) — payment processing</li>
          </ul>
        </Block>

        <Block title="5. Data Retention">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>Account data: while your account is active + 90 days after deletion</li>
            <li>Cached advertising data: up to 90 days for historical reporting</li>
            <li>Logs: 30 days</li>
            <li>Data is permanently purged from backups after the retention period</li>
          </ul>
        </Block>

        <Block title="6. Your Rights (PDPA / GDPR)">
          <p>You have the right to:</p>
          <ul className="ml-6 list-disc space-y-1.5">
            <li>Access and download your data</li>
            <li>Correct inaccurate information</li>
            <li>Delete your account and all data (see <Link className="text-primary underline-offset-4 hover:underline" href="/data-deletion">Data Deletion</Link>)</li>
            <li>Withdraw consent (disconnect Meta at any time)</li>
            <li>Data portability</li>
            <li>Lodge a complaint with the Personal Data Protection Committee (PDPC) if you believe we have violated your rights</li>
          </ul>
          <p className="mt-3">Contact: <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
        </Block>

        <Block title="7. Security">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>All data in transit is encrypted with TLS (HTTPS)</li>
            <li>Passwords are stored as bcrypt hashes (irreversible)</li>
            <li>Meta access tokens are encrypted at rest using AES-256-GCM</li>
            <li>Session cookies are httpOnly, secure, sameSite=lax</li>
          </ul>
        </Block>

        <Block title="8. Changes to This Policy">
          We may update this policy from time to time. We will notify you via email of material changes at least 14 days before they take effect.
        </Block>

        <Block title="9. Contact Us">
          Email: <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </Block>
      </section>

      <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
        <Link href="/terms" className="underline-offset-4 hover:underline">Terms of Service</Link>
        {" · "}
        <Link href="/refund-policy" className="underline-offset-4 hover:underline">Refund Policy</Link>
        {" · "}
        <Link href="/data-deletion" className="underline-offset-4 hover:underline">Data Deletion</Link>
        {" · "}
        <Link href="/" className="underline-offset-4 hover:underline">AdsLab</Link>
      </footer>
    </main>
    <SiteFooter />
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}
