import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service / ข้อกำหนดการใช้บริการ · AdsLab",
  description: "Terms governing the use of AdsLab.",
};

const LAST_UPDATED = "2026-05-11";
const CONTACT_EMAIL = "koondyasdw@gmail.com";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← AdsLab
        </Link>
      </div>

      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service / ข้อกำหนดการใช้บริการ</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated / อัปเดตล่าสุด: {LAST_UPDATED}</p>
      </header>

      {/* ============== Thai ============== */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">ภาษาไทย</h2>

        <Block title="1. การยอมรับข้อกำหนด">
          การสมัครและใช้บริการ AdsLab ถือว่าคุณยอมรับข้อกำหนดฉบับนี้และ <Link className="text-primary underline-offset-4 hover:underline" href="/privacy">นโยบายความเป็นส่วนตัว</Link> ของเรา
          หากคุณไม่ยอมรับ กรุณาหยุดใช้บริการ
        </Block>

        <Block title="2. บริการที่ให้">
          AdsLab เป็นเครื่องมือบริหารจัดการแคมเปญโฆษณาดิจิทัล รวมถึง dashboard, AI report, AI optimization
          เราเป็น <strong>เครื่องมือเสริม</strong> — ไม่ใช่ผู้รับประกันผลลัพธ์ทางการตลาด การตัดสินใจสุดท้ายเป็นของผู้ใช้
        </Block>

        <Block title="3. บัญชีผู้ใช้">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>คุณต้องมีอายุ 20 ปีบริบูรณ์ขึ้นไป หรือได้รับอนุญาตจากผู้ปกครอง</li>
            <li>คุณรับผิดชอบการรักษาความปลอดภัยของรหัสผ่าน</li>
            <li>ห้ามแบ่งปันบัญชีกับผู้อื่น (ใช้ระบบ Team / Workspace แทน)</li>
            <li>คุณต้องให้ข้อมูลที่ถูกต้องและอัปเดต</li>
          </ul>
        </Block>

        <Block title="4. การใช้งานที่ยอมรับได้">
          คุณตกลงจะไม่:
          <ul className="ml-6 list-disc space-y-1.5">
            <li>ใช้ AdsLab ในกิจกรรมที่ผิดกฎหมาย หรือละเมิดนโยบายของ Meta</li>
            <li>พยายามเข้าถึงข้อมูลของผู้ใช้รายอื่นโดยไม่ได้รับอนุญาต</li>
            <li>ใช้ scraping, reverse engineering, หรือ rate-limit bypass</li>
            <li>ส่ง spam, malware, หรือเนื้อหาที่ละเมิดทรัพย์สินทางปัญญา</li>
            <li>ใช้ AI features เพื่อสร้างข้อมูลที่ทำให้เข้าใจผิดอย่างเป็นระบบ</li>
          </ul>
        </Block>

        <Block title="5. การชำระเงิน (Phase 2 — ตอนนี้ฟรี)">
          ในช่วง MVP / Beta บริการเป็น free. เมื่อเริ่ม subscription:
          <ul className="ml-6 list-disc space-y-1.5">
            <li>คุณจะได้ระยะทดลองฟรี 30 วัน</li>
            <li>ค่าบริการจะเรียกเก็บล่วงหน้ารายเดือน/รายปี</li>
            <li>ยกเลิกได้ทุกเมื่อ — บริการสิ้นสุดสิ้นรอบบิลปัจจุบัน</li>
            <li>คืนเงิน: ภายใน 7 วันแรกของรอบบิลใหม่ ในกรณีที่ยังไม่ได้ใช้งานหลัก</li>
          </ul>
        </Block>

        <Block title="6. ทรัพย์สินทางปัญญา">
          AdsLab (รวมถึง code, design, AI prompts, brand) เป็นของเรา
          ข้อมูลและเนื้อหาที่คุณ upload หรือสร้างผ่าน AdsLab ยังคงเป็นของคุณ — เราเพียงประมวลผลเพื่อให้บริการ
        </Block>

        <Block title="7. ข้อจำกัดความรับผิด">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>AdsLab ให้บริการ &quot;as-is&quot; ไม่รับประกันผลกำไรหรือผลลัพธ์ทางการตลาด</li>
            <li>เราไม่รับผิดต่อความเสียหายทางอ้อม (เช่น ขาดทุนจากการตัดสินใจตาม AI suggestion)</li>
            <li>ความรับผิดสูงสุดจำกัดที่ค่าบริการที่คุณจ่ายมา 12 เดือนล่าสุด</li>
          </ul>
        </Block>

        <Block title="8. การยกเลิก / การระงับบริการ">
          เรามีสิทธิ์ระงับ/ยกเลิกบัญชีที่ละเมิดข้อกำหนดนี้ คุณยกเลิกบัญชีของคุณเองได้ที่ Settings
          ดูการลบข้อมูลที่ <Link className="text-primary underline-offset-4 hover:underline" href="/data-deletion">Data Deletion</Link>
        </Block>

        <Block title="9. กฎหมายที่ใช้บังคับ">
          ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย ข้อพิพาทพิจารณาที่ศาลในประเทศไทย
        </Block>

        <Block title="10. การเปลี่ยนแปลงข้อกำหนด">
          เราอาจปรับปรุงข้อกำหนดเป็นครั้งคราว แจ้งทางอีเมล 14 วันก่อนมีผล
        </Block>

        <Block title="11. ติดต่อ">
          อีเมล: <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </Block>
      </section>

      <hr className="my-12 border-border" />

      {/* ============== English ============== */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">English</h2>

        <Block title="1. Acceptance of Terms">
          By signing up for and using AdsLab, you agree to these Terms and our <Link className="text-primary underline-offset-4 hover:underline" href="/privacy">Privacy Policy</Link>.
          If you do not agree, please discontinue use.
        </Block>

        <Block title="2. Service Description">
          AdsLab is a digital advertising campaign management platform including dashboards, AI reports, and AI optimization.
          We are a <strong>tool</strong> — not a guarantor of marketing results. Final decisions remain with the user.
        </Block>

        <Block title="3. User Accounts">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>You must be 20+ years old, or have parental/guardian consent</li>
            <li>You are responsible for password security</li>
            <li>Do not share accounts (use Team / Workspace features instead)</li>
            <li>Provide accurate and up-to-date information</li>
          </ul>
        </Block>

        <Block title="4. Acceptable Use">
          You agree not to:
          <ul className="ml-6 list-disc space-y-1.5">
            <li>Use AdsLab for illegal activity or in violation of Meta&apos;s policies</li>
            <li>Attempt to access other users&apos; data without authorization</li>
            <li>Scrape, reverse-engineer, or bypass rate limits</li>
            <li>Send spam, malware, or copyright-infringing content</li>
            <li>Use AI features to systematically generate misleading content</li>
          </ul>
        </Block>

        <Block title="5. Payment (Phase 2 — currently free)">
          During MVP / Beta the service is free. When subscriptions launch:
          <ul className="ml-6 list-disc space-y-1.5">
            <li>You will receive a 30-day free trial</li>
            <li>Fees are charged in advance, monthly or annually</li>
            <li>Cancel at any time — service ends at the end of the current billing cycle</li>
            <li>Refunds: within the first 7 days of a new billing cycle if usage was minimal</li>
          </ul>
        </Block>

        <Block title="6. Intellectual Property">
          AdsLab (including code, design, AI prompts, brand) belongs to us.
          Data and content you upload or generate through AdsLab remains yours — we only process it to provide the service.
        </Block>

        <Block title="7. Limitation of Liability">
          <ul className="ml-6 list-disc space-y-1.5">
            <li>AdsLab is provided &quot;as-is&quot; with no guarantee of profit or marketing results</li>
            <li>We are not liable for indirect damages (e.g. losses from decisions based on AI suggestions)</li>
            <li>Maximum liability is capped at fees paid by you in the prior 12 months</li>
          </ul>
        </Block>

        <Block title="8. Termination / Suspension">
          We reserve the right to suspend or terminate accounts that violate these Terms.
          You may cancel your own account at any time in Settings. See <Link className="text-primary underline-offset-4 hover:underline" href="/data-deletion">Data Deletion</Link> for data removal.
        </Block>

        <Block title="9. Governing Law">
          These Terms are governed by the laws of Thailand. Disputes will be resolved in Thai courts.
        </Block>

        <Block title="10. Changes to These Terms">
          We may update these Terms from time to time. We will notify you via email at least 14 days before changes take effect.
        </Block>

        <Block title="11. Contact">
          Email: <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </Block>
      </section>

      <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
        <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy Policy</Link>
        {" · "}
        <Link href="/data-deletion" className="underline-offset-4 hover:underline">Data Deletion</Link>
        {" · "}
        <Link href="/" className="underline-offset-4 hover:underline">AdsLab</Link>
      </footer>
    </main>
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
