type VerifyEmailParams = {
  name: string;
  verifyUrl: string;
};

type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export function verifyEmailTemplate({ name, verifyUrl }: VerifyEmailParams): EmailTemplate {
  const subject = "ยืนยันอีเมลของคุณ - AdsLab";

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
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:40px 40px 0 40px;">
                <div style="font-size:20px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em;">AdsLab</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px 40px;">
                <h1 style="margin:0;font-size:24px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em;line-height:1.3;">สวัสดี${escapeHtml(name)} 👋</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px;">
                <p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">
                  ขอบคุณที่สมัครใช้ AdsLab! เพื่อเริ่มใช้งานบัญชี กรุณายืนยันอีเมลของคุณโดยกดปุ่มด้านล่าง
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="background-color:#06B6D4;border-radius:8px;">
                      <a href="${escapeHtmlAttr(verifyUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:-0.005em;">
                        ยืนยันอีเมล
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 8px 40px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#71717A;">
                  หรือคัดลอกลิงก์นี้ไปวางใน browser:
                </p>
                <p style="margin:8px 0 0 0;font-size:13px;line-height:1.5;color:#06B6D4;word-break:break-all;">
                  ${escapeHtml(verifyUrl)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 40px 40px;border-top:1px solid #F4F4F5;margin-top:32px;">
                <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#A1A1AA;">
                  ลิงก์นี้จะหมดอายุภายใน 24 ชั่วโมง<br />
                  หากคุณไม่ได้สมัครสมาชิก AdsLab สามารถละเลยอีเมลนี้ได้
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

  const text = `สวัสดี${name}

ขอบคุณที่สมัครใช้ AdsLab! เพื่อเริ่มใช้งานบัญชี กรุณายืนยันอีเมลของคุณโดยเข้าลิงก์นี้:

${verifyUrl}

ลิงก์นี้จะหมดอายุภายใน 24 ชั่วโมง
หากคุณไม่ได้สมัครสมาชิก AdsLab สามารถละเลยอีเมลนี้ได้

— AdsLab`;

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
