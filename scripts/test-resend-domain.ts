/**
 * Send a test email via Resend from the newly-verified noreply@ads-lab.xyz
 * to confirm the domain switch works end-to-end.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Resend } from "resend";

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from: "AdsLab <noreply@ads-lab.xyz>",
    to: "indyworkff3@hotmail.com",
    subject: "Test: noreply@ads-lab.xyz domain verification",
    html: `<p>หากคุณได้รับอีเมลนี้ แปลว่า Resend domain ads-lab.xyz <strong>verify สำเร็จ</strong> และระบบส่งอีเมลจาก <code>noreply@ads-lab.xyz</code> ทำงานเรียบร้อย</p>
<p>From: AdsLab via Resend (test domain switch)</p>`,
    text: "Test from noreply@ads-lab.xyz via Resend",
  });

  if (result.error) {
    console.error("✗ Failed:", result.error);
    process.exit(1);
  }
  console.log(`✓ Sent: ${result.data?.id}`);
  console.log("Check indyworkff3@hotmail.com inbox (also check spam folder)");
}

main();
