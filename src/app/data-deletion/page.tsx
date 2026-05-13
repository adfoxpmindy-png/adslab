import Link from "next/link";
import type { Metadata } from "next";

import { SiteFooter } from "@/components/site-footer";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Data Deletion / ลบข้อมูล · AdsLab",
  description: "How to request deletion of your data from AdsLab.",
};

const CONTACT_EMAIL = COMPANY.supportEmail;

export default function DataDeletionPage() {
  return (
    <>
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← AdsLab
        </Link>
      </div>

      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Data Deletion / การลบข้อมูล</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          ขออภัยที่คุณจะออกจาก AdsLab — เราเก็บข้อมูลของคุณเท่าที่จำเป็นเสมอและพร้อมลบเมื่อคุณขอ
        </p>
      </header>

      {/* Thai */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">ภาษาไทย</h2>

        <Block title="1. ลบข้อมูลผ่านระบบ (Recommended)">
          วิธีที่เร็วที่สุด:
          <ol className="ml-6 mt-2 list-decimal space-y-1.5">
            <li>ล็อกอิน AdsLab</li>
            <li>ไปที่ <strong>Settings → Account</strong></li>
            <li>กด <strong>&quot;ลบบัญชีของฉัน&quot;</strong></li>
            <li>ยืนยันด้วยรหัสผ่าน</li>
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">
            ⏳ การลบจะเสร็จสมบูรณ์ภายใน 30 วัน (รวมการลบจาก backup)
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <em>หมายเหตุ: ฟีเจอร์ลบบัญชีใน UI จะเปิดให้ใช้ใน Phase 2 — ขณะนี้กรุณาใช้วิธีที่ 2</em>
          </p>
        </Block>

        <Block title="2. ลบข้อมูลผ่านอีเมล">
          ส่งอีเมลถึง <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}?subject=Data%20Deletion%20Request`}>{CONTACT_EMAIL}</a> โดยใส่:
          <ul className="ml-6 mt-2 list-disc space-y-1.5">
            <li>อีเมลที่ใช้สมัคร AdsLab</li>
            <li>ชื่อเต็ม</li>
            <li>เหตุผล (ระบุหรือไม่ก็ได้)</li>
          </ul>
          <p className="mt-3 text-sm">เราจะยืนยันคำขอภายใน 3 วันทำการ และดำเนินการลบให้เสร็จภายใน 30 วัน</p>
        </Block>

        <Block title="3. การลบข้อมูลผ่าน Facebook">
          ถ้าคุณ revoke การอนุญาตจาก Facebook (Settings → Apps and Websites → AdsLab → Remove)
          Meta จะแจ้งให้เราทราบ และเราจะลบ Meta connection ของคุณภายใน 7 วัน
          (บัญชี AdsLab จะยังคงอยู่ — ต้องใช้วิธีที่ 1 หรือ 2 หากต้องการลบบัญชีทั้งหมด)
        </Block>

        <Block title="4. ข้อมูลอะไรบ้างจะถูกลบ">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>บัญชี (อีเมล, ชื่อ, password hash)</li>
            <li>Workspace / Tenant ทั้งหมดที่คุณเป็น owner ถ้าไม่มีสมาชิกอื่น</li>
            <li>Meta access token + cached ad accounts</li>
            <li>Cached campaign insights และ AI reports</li>
            <li>Log activity ทั้งหมด</li>
          </ul>
          <p className="mt-3"><strong>ข้อมูลที่อาจเหลือ:</strong> Invoice / receipt ตามกฎหมายภาษีไทย (เก็บ 5 ปี)</p>
        </Block>
      </section>

      <hr className="my-12 border-border" />

      {/* English */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">English</h2>

        <Block title="1. Delete via the App (Recommended)">
          Fastest method:
          <ol className="ml-6 mt-2 list-decimal space-y-1.5">
            <li>Log in to AdsLab</li>
            <li>Go to <strong>Settings → Account</strong></li>
            <li>Click <strong>&quot;Delete my account&quot;</strong></li>
            <li>Confirm with your password</li>
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">
            ⏳ Deletion completes within 30 days (including from backups)
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            <em>Note: in-app account deletion will be available in Phase 2 — for now please use method 2 below.</em>
          </p>
        </Block>

        <Block title="2. Delete via Email">
          Send an email to <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}?subject=Data%20Deletion%20Request`}>{CONTACT_EMAIL}</a> with:
          <ul className="ml-6 mt-2 list-disc space-y-1.5">
            <li>The email you used to sign up</li>
            <li>Your full name</li>
            <li>Reason (optional)</li>
          </ul>
          <p className="mt-3 text-sm">We will acknowledge your request within 3 business days and complete deletion within 30 days.</p>
        </Block>

        <Block title="3. Deletion via Facebook">
          If you revoke permission from Facebook (Settings → Apps and Websites → AdsLab → Remove),
          Meta will notify us and we will delete your Meta connection within 7 days.
          (Your AdsLab account will remain — use method 1 or 2 if you want to fully delete the account.)
        </Block>

        <Block title="4. What Data Will Be Deleted">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>Account (email, name, password hash)</li>
            <li>Workspace / Tenant where you are the sole Owner</li>
            <li>Meta access token + cached ad accounts</li>
            <li>Cached campaign insights and AI reports</li>
            <li>Activity logs</li>
          </ul>
          <p className="mt-3"><strong>Data that may be retained:</strong> Invoices / receipts as required by Thai tax law (5 years).</p>
        </Block>
      </section>

      <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
        <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy Policy</Link>
        {" · "}
        <Link href="/terms" className="underline-offset-4 hover:underline">Terms of Service</Link>
        {" · "}
        <Link href="/refund-policy" className="underline-offset-4 hover:underline">Refund Policy</Link>
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
