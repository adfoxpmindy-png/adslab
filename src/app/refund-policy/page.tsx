import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { COMPANY } from "@/lib/company";

export const metadata = {
  title: "นโยบายการคืนเงิน · AdsLab",
  description: "เงื่อนไขการคืนเงินสำหรับการสมัครสมาชิก AdsLab",
};

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← กลับหน้าหลัก
        </Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight">นโยบายการคืนเงิน</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Refund Policy · ปรับปรุงล่าสุด: 13 พฤษภาคม 2026
        </p>

        <section className="prose prose-sm mt-8 max-w-none dark:prose-invert">
          <h2>1. ทดลองใช้ฟรี 7 วัน</h2>
          <p>
            ผู้สมัครสมาชิก AdsLab ใหม่ทุกบัญชีจะได้สิทธิ์ทดลองใช้งานฟรีเป็นเวลา <strong>7 วัน</strong> นับจากวันที่บันทึกข้อมูลบัตรเครดิตเรียบร้อย
            ระหว่างช่วงทดลองใช้ คุณสามารถใช้งานฟีเจอร์ของแพ็กเกจที่เลือกได้เต็มรูปแบบ และ
            <strong>ยกเลิกได้ตลอดเวลาโดยไม่มีการเรียกเก็บเงิน</strong>
          </p>
          <p>
            หากคุณไม่ยกเลิกก่อนสิ้นสุดช่วงทดลองใช้ ระบบจะเริ่มเรียกเก็บเงินตามแพ็กเกจที่เลือกในวันถัดไปโดยอัตโนมัติ
            เราจะส่งอีเมลแจ้งเตือนล่วงหน้า 2 วัน, 1 วัน และในวันที่ครบกำหนดเพื่อให้คุณตัดสินใจ
          </p>

          <h2>2. การคืนเงินสำหรับรอบบิลใหม่ (Pro-rated refund)</h2>
          <p>
            หลังจากเรียกเก็บเงินรอบใหม่ (หลังหมดช่วงทดลอง หรือต่ออายุประจำเดือน/ปี) คุณมีสิทธิ์ขอคืนเงิน
            <strong>ภายใน 7 วันแรกของรอบบิล</strong> โดยจำนวนเงินที่คืนจะคำนวณตามสัดส่วนวันที่เหลือของรอบบิล (pro-rated)
          </p>
          <p>
            <strong>สูตรการคำนวณ:</strong>
            <br />
            <code>เงินคืน = จำนวนเงินที่จ่าย × (วันที่เหลือในรอบบิล ÷ จำนวนวันทั้งหมดในรอบบิล)</code>
          </p>
          <p>
            <strong>ตัวอย่าง:</strong> สมัครแพ็กเกจ Starter ฿1,490/เดือน ใช้งานไป 3 วัน ขอคืนเงิน
            <br />
            เงินคืน = ฿1,490 × (27 ÷ 30) = ฿1,341
          </p>

          <h2>3. การยกเลิกการสมัคร</h2>
          <p>
            คุณสามารถยกเลิกการสมัครได้ตลอดเวลาจากหน้า <code>Settings → Billing → ยกเลิกการสมัคร</code>
            เมื่อยกเลิก:
          </p>
          <ul>
            <li>คุณยังคงเข้าใช้งานได้จนถึงสิ้นสุดรอบบิลปัจจุบัน (ไม่มีการคืนเงินอัตโนมัติ)</li>
            <li>ไม่มีการต่ออายุอัตโนมัติในรอบถัดไป</li>
            <li>ข้อมูลของคุณจะยังคงอยู่ในระบบ 90 วัน หากกลับมาสมัครใหม่ภายในเวลานี้ ข้อมูลทั้งหมดจะถูกกู้คืน</li>
          </ul>

          <h2>4. กรณีที่ขอคืนเงินไม่ได้</h2>
          <p>ในกรณีต่อไปนี้ เราไม่สามารถคืนเงินให้ได้:</p>
          <ul>
            <li>เกินกำหนด 7 วันแรกของรอบบิล (คุณยังคงสามารถยกเลิกไม่ให้ต่ออายุได้)</li>
            <li>บัญชีของคุณถูกระงับเนื่องจากละเมิดข้อกำหนดการใช้บริการ</li>
            <li>การชำระเงินผ่านช่องทางอื่นที่ไม่ใช่ Omise (เช่น โอนตรง — ไม่รองรับใน Phase ปัจจุบัน)</li>
          </ul>

          <h2>5. ขั้นตอนการขอคืนเงิน</h2>
          <ol>
            <li>ไปที่ <code>Settings → Billing</code> ในแดชบอร์ดของคุณ</li>
            <li>ในรายการ Invoice ที่ต้องการ คลิก <code>ขอคืนเงิน</code></li>
            <li>ระบบจะประมวลผลและคืนเงินกลับไปยังบัตรเครดิตเดิมผ่าน Omise ภายใน 5-10 วันทำการ</li>
            <li>คุณจะได้รับอีเมลยืนยันเมื่อ refund สำเร็จ</li>
          </ol>
          <p>
            หากพบปัญหาหรือต้องการคืนเงินด้วยเหตุผลพิเศษ ติดต่อเราที่{" "}
            <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a> เราจะพิจารณาเป็นกรณีไป
          </p>

          <h2>6. การเปลี่ยนแพ็กเกจ</h2>
          <p>
            หากคุณอัปเกรดแพ็กเกจ (เช่น Starter → Pro) ระหว่างรอบบิล ระบบจะเรียกเก็บส่วนต่าง pro-rated ของวันที่เหลือ
            หากคุณดาวน์เกรด แพ็กเกจใหม่จะเริ่มในรอบบิลถัดไป (ไม่มีการคืนส่วนต่าง)
          </p>

          <h2>7. ติดต่อสอบถาม</h2>
          <p>
            อีเมล: <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
            <br />
            โทรศัพท์: {COMPANY.contactPhone}
            <br />
            ที่อยู่: {COMPANY.addressTh}
          </p>

          <hr />

          <h2 id="english">Refund Policy (English Summary)</h2>
          <p>
            <strong>7-day free trial:</strong> No charge during trial period. Cancel anytime via Settings → Billing.
          </p>
          <p>
            <strong>Pro-rated refund within 7 days of new billing cycle:</strong> Eligible amount calculated as
            <code> payment × (remaining_days ÷ total_days_in_period)</code>.
          </p>
          <p>
            <strong>Cancellation:</strong> Access continues until end of current billing period. No refund issued on
            cancellation itself, but no further charges.
          </p>
          <p>
            <strong>Non-refundable cases:</strong> Beyond 7-day window; suspended accounts due to ToS violation.
          </p>
          <p>
            <strong>Contact:</strong> {COMPANY.supportEmail} · {COMPANY.contactPhone}
          </p>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
