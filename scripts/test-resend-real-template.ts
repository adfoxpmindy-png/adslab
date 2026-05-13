/**
 * ส่งอีเมลจริงโดยใช้ template ที่ลูกค้าจะได้รับจริง — เพื่อให้เห็นว่า
 * email ที่ AdsLab ส่งจาก noreply@ads-lab.xyz หน้าตาเป็นยังไง
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sendEmail } from "../src/lib/email/send";
import { invoicePaidTemplate, trialReminder2dTemplate } from "../src/lib/email/templates/billing";
import { verifyEmailTemplate } from "../src/lib/email/templates/verify-email";

async function main() {
  const RECIPIENT = "indyworkff3@hotmail.com";
  const USER_NAME = "นภดล";
  const APP_URL = "https://ads-lab.xyz";

  console.log("ส่งอีเมล 3 แบบที่ลูกค้าจะได้รับจริง:\n");

  // 1. Verify email (ที่ user ได้หลัง signup)
  console.log("1/3: Verify email...");
  const verifyTpl = verifyEmailTemplate({
    name: USER_NAME,
    verifyUrl: `${APP_URL}/verify-email?token=demo-token-12345`,
  });
  const r1 = await sendEmail({ to: RECIPIENT, ...verifyTpl });
  console.log(r1.ok ? `  ✓ ส่งแล้ว: ${r1.id}` : `  ✗ failed: ${r1.error}`);

  // 2. Trial reminder (ที่ user ได้ก่อนหมดทดลอง)
  console.log("\n2/3: Trial reminder (เหลือ 2 วันก่อนเก็บเงิน)...");
  const reminderTpl = trialReminder2dTemplate({
    name: USER_NAME,
    planName: "Pro",
    priceThb: 10990,
    dashboardUrl: `${APP_URL}/t/demo/settings/billing`,
  });
  const r2 = await sendEmail({ to: RECIPIENT, ...reminderTpl });
  console.log(r2.ok ? `  ✓ ส่งแล้ว: ${r2.id}` : `  ✗ failed: ${r2.error}`);

  // 3. Invoice paid (ที่ user ได้หลังจ่ายเงินสำเร็จ)
  console.log("\n3/3: Invoice paid receipt...");
  const receiptTpl = invoicePaidTemplate({
    name: USER_NAME,
    amountThb: 10990,
    baseThb: 10271,
    vatThb: 719,
    planName: "Pro (รายเดือน)",
    invoiceUrl: `${APP_URL}/t/demo/settings/billing`,
  });
  const r3 = await sendEmail({ to: RECIPIENT, ...receiptTpl });
  console.log(r3.ok ? `  ✓ ส่งแล้ว: ${r3.id}` : `  ✗ failed: ${r3.error}`);

  console.log(`\nเช็ค ${RECIPIENT} — ทั้ง inbox + junk folder`);
  console.log("ทั้ง 3 emails ส่งจาก noreply@ads-lab.xyz");
}

main().catch(console.error);
