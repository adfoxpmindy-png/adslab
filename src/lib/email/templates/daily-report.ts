import { renderMarkdown } from "@/lib/markdown";

type DailyReportEmailParams = {
  recipientName: string;
  tenantName: string;
  dateLabel: string;
  contentMd: string;
  reportUrl: string;
};

type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export function dailyReportEmailTemplate({
  recipientName,
  tenantName,
  dateLabel,
  contentMd,
  reportUrl,
}: DailyReportEmailParams): EmailTemplate {
  const subject = `AdsLab Daily — ${tenantName} — ${dateLabel}`;
  const bodyHtml = renderMarkdown(contentMd, { emailStyles: true });

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','IBM Plex Sans Thai',Inter,Roboto,sans-serif;color:#0A0A0A;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAFA;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 40px 0 40px;">
                <div style="font-size:20px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em;">AdsLab</div>
                <p style="margin:4px 0 0 0;font-size:12px;color:#71717A;text-transform:uppercase;letter-spacing:0.05em;">Daily Report</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 8px 40px;">
                <h1 style="margin:0;font-size:22px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em;line-height:1.3;">สวัสดี${escapeHtml(recipientName)} 👋</h1>
                <p style="margin:8px 0 0 0;font-size:14px;color:#52525B;">
                  รายงานสำหรับ <strong style="color:#0A0A0A;">${escapeHtml(tenantName)}</strong> · ${escapeHtml(dateLabel)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 24px 40px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="background-color:#06B6D4;border-radius:8px;">
                      <a href="${escapeHtmlAttr(reportUrl)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:-0.005em;">
                        เปิดดูใน AdsLab →
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 32px 40px;border-top:1px solid #F4F4F5;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#A1A1AA;">
                  รายงานนี้ส่งโดย AdsLab ทุกเช้า 09:00 น. (เวลาประเทศไทย)<br />
                  หากไม่ต้องการรับรายงาน — เข้าไปปิดได้ที่ Settings ใน AdsLab
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0 0;font-size:12px;color:#A1A1AA;">
            AdsLab · ยิงแอดให้เร็ว แม่น scale ได้
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `สวัสดี ${recipientName}

รายงานประจำวันสำหรับ ${tenantName} (${dateLabel})

${contentMd}

อ่านในเว็บ: ${reportUrl}

— AdsLab Daily Report`;

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}
