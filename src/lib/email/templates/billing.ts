/**
 * Billing email templates. All Thai-language, brand-consistent with
 * verify-email template.
 */

type EmailTemplate = { subject: string; html: string; text: string };

function shell(opts: {
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  bodyText: string;
}): { html: string; text: string } {
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<tr><td style="padding:32px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color:#06B6D4;border-radius:8px;"><a href="${escapeHtmlAttr(opts.ctaUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:-0.005em;">${escapeHtml(opts.ctaLabel)}</a></td></tr></table></td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="th">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background-color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','IBM Plex Sans Thai',Inter,Roboto,sans-serif;color:#0A0A0A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAFA;padding:48px 16px;">
<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;">
<tr><td style="padding:40px 40px 0 40px;"><div style="font-size:20px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em;">AdsLab</div></td></tr>
<tr><td style="padding:24px 40px 8px 40px;"><h1 style="margin:0;font-size:24px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em;line-height:1.3;">${escapeHtml(opts.title)}</h1></td></tr>
<tr><td style="padding:0 40px 16px 40px;">${opts.bodyHtml}</td></tr>
${cta}
<tr><td style="padding:24px 40px 40px 40px;border-top:1px solid #F4F4F5;"><p style="margin:24px 0 0 0;font-size:12px;line-height:1.6;color:#A1A1AA;">AdsLab · ยิงแอดให้เร็ว แม่น scale ได้</p></td></tr>
</table></td></tr></table></body></html>`;

  const text = `${opts.title}

${opts.bodyText}${opts.ctaUrl ? `\n\n${opts.ctaUrl}\n` : ""}

— AdsLab`;

  return { html, text };
}

export function trialReminder2dTemplate(opts: {
  name: string;
  planName: string;
  priceThb: number;
  dashboardUrl: string;
}): EmailTemplate {
  const subject = "เหลือ 2 วันก่อนเริ่มเก็บเงิน — AdsLab";
  const { html, text } = shell({
    title: "เหลืออีก 2 วันจะเริ่มเก็บเงิน",
    bodyHtml: `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">สวัสดี${escapeHtml(opts.name)} 👋</p><p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#52525B;">ทดลองใช้ AdsLab ของคุณจะหมดอายุในอีก <b>2 วัน</b> หลังจากนั้นเราจะเรียกเก็บเงินตามแพ็กเกจ <b>${escapeHtml(opts.planName)}</b> (${opts.priceThb.toLocaleString("th-TH")} บาท/เดือน) จากบัตรที่คุณบันทึกไว้</p><p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#71717A;">หากต้องการเปลี่ยน plan, ยกเลิก, หรือใช้บัตรอื่น สามารถจัดการได้ที่หน้า Settings → Billing</p>`,
    ctaLabel: "ไปที่ Settings",
    ctaUrl: opts.dashboardUrl,
    bodyText: `สวัสดี${opts.name}\n\nทดลองใช้ AdsLab ของคุณจะหมดอายุในอีก 2 วัน หลังจากนั้นเราจะเรียกเก็บเงินตามแพ็กเกจ ${opts.planName} (${opts.priceThb.toLocaleString("th-TH")} บาท/เดือน)\n\nหากต้องการเปลี่ยน plan หรือยกเลิก ไปที่:`,
  });
  return { subject, html, text };
}

export function trialReminder1dTemplate(opts: {
  name: string;
  planName: string;
  priceThb: number;
  dashboardUrl: string;
}): EmailTemplate {
  const subject = "พรุ่งนี้จะเริ่มเก็บเงิน — AdsLab";
  const { html, text } = shell({
    title: "พรุ่งนี้จะเริ่มเก็บเงิน",
    bodyHtml: `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">สวัสดี${escapeHtml(opts.name)} 👋</p><p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#52525B;">ทดลองใช้ AdsLab ของคุณจะหมดอายุภายใน <b>24 ชั่วโมง</b> เราจะเรียกเก็บเงิน <b>${opts.priceThb.toLocaleString("th-TH")} บาท</b> สำหรับแพ็กเกจ ${escapeHtml(opts.planName)}</p>`,
    ctaLabel: "จัดการบัญชี",
    ctaUrl: opts.dashboardUrl,
    bodyText: `สวัสดี${opts.name}\n\nทดลองใช้ AdsLab จะหมดอายุภายใน 24 ชั่วโมง เราจะเรียกเก็บเงิน ${opts.priceThb.toLocaleString("th-TH")} บาท สำหรับแพ็กเกจ ${opts.planName}`,
  });
  return { subject, html, text };
}

export function invoicePaidTemplate(opts: {
  name: string;
  amountThb: number;
  vatThb: number;
  baseThb: number;
  planName: string;
  invoiceUrl: string;
}): EmailTemplate {
  const subject = `ใบเสร็จ ${opts.amountThb.toLocaleString("th-TH")} บาท — AdsLab`;
  const { html, text } = shell({
    title: "ชำระเงินสำเร็จ ✓",
    bodyHtml: `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">สวัสดี${escapeHtml(opts.name)},</p><p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#52525B;">ขอบคุณที่ใช้ AdsLab! เราได้รับการชำระเงินของคุณแล้ว</p><table style="margin-top:20px;width:100%;border-collapse:collapse;font-size:14px;color:#3F3F46;"><tr><td style="padding:8px 0;border-bottom:1px solid #F4F4F5;">แพ็กเกจ</td><td align="right" style="padding:8px 0;border-bottom:1px solid #F4F4F5;font-weight:600;">${escapeHtml(opts.planName)}</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid #F4F4F5;">ราคา (ก่อน VAT)</td><td align="right" style="padding:8px 0;border-bottom:1px solid #F4F4F5;">${opts.baseThb.toLocaleString("th-TH")} บาท</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid #F4F4F5;">VAT 7%</td><td align="right" style="padding:8px 0;border-bottom:1px solid #F4F4F5;">${opts.vatThb.toLocaleString("th-TH")} บาท</td></tr><tr><td style="padding:12px 0;font-weight:700;color:#0A0A0A;">รวมทั้งสิ้น</td><td align="right" style="padding:12px 0;font-weight:700;color:#0A0A0A;">${opts.amountThb.toLocaleString("th-TH")} บาท</td></tr></table>`,
    ctaLabel: "ดูใบเสร็จ",
    ctaUrl: opts.invoiceUrl,
    bodyText: `สวัสดี${opts.name},\n\nขอบคุณ! เราได้รับการชำระเงิน ${opts.amountThb.toLocaleString("th-TH")} บาท สำหรับแพ็กเกจ ${opts.planName} แล้ว`,
  });
  return { subject, html, text };
}

export function invoiceFailedTemplate(opts: {
  name: string;
  amountThb: number;
  reason: string;
  retryUrl: string;
}): EmailTemplate {
  const subject = "ชำระเงินไม่สำเร็จ — กรุณาตรวจสอบบัตร — AdsLab";
  const { html, text } = shell({
    title: "ชำระเงินไม่สำเร็จ ❌",
    bodyHtml: `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">สวัสดี${escapeHtml(opts.name)},</p><p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#52525B;">เราพยายามเรียกเก็บเงิน <b>${opts.amountThb.toLocaleString("th-TH")} บาท</b> แต่ไม่สำเร็จ</p><p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#71717A;">เหตุผล: ${escapeHtml(opts.reason)}</p><p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#71717A;">คุณมีเวลา 3 วันในการอัปเดตวิธีชำระเงิน หลังจากนั้นบัญชีจะถูกระงับ</p>`,
    ctaLabel: "อัปเดตบัตร",
    ctaUrl: opts.retryUrl,
    bodyText: `สวัสดี${opts.name},\n\nเราพยายามเรียกเก็บเงิน ${opts.amountThb.toLocaleString("th-TH")} บาท แต่ไม่สำเร็จ\n\nเหตุผล: ${opts.reason}\n\nคุณมีเวลา 3 วันในการอัปเดตวิธีชำระเงิน`,
  });
  return { subject, html, text };
}

export function subscriptionCancelledTemplate(opts: {
  name: string;
  accessUntil: string;
  resubscribeUrl: string;
}): EmailTemplate {
  const subject = "ยกเลิกการสมัครเรียบร้อย — AdsLab";
  const { html, text } = shell({
    title: "ยกเลิกการสมัครเรียบร้อย",
    bodyHtml: `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">สวัสดี${escapeHtml(opts.name)},</p><p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#52525B;">เราได้ยกเลิกการสมัคร AdsLab ของคุณแล้ว คุณยังสามารถเข้าใช้งานได้จนถึง <b>${escapeHtml(opts.accessUntil)}</b></p><p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#71717A;">หากเปลี่ยนใจ สามารถสมัครใหม่ได้ตลอดเวลา ข้อมูลทั้งหมดของคุณจะยังคงอยู่</p>`,
    ctaLabel: "สมัครอีกครั้ง",
    ctaUrl: opts.resubscribeUrl,
    bodyText: `สวัสดี${opts.name},\n\nเราได้ยกเลิกการสมัคร AdsLab ของคุณแล้ว คุณยังสามารถเข้าใช้งานได้จนถึง ${opts.accessUntil}`,
  });
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}
