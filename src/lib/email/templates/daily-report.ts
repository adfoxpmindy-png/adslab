import { getTranslations } from "next-intl/server";

import { renderMarkdown } from "@/lib/markdown";
import type { Locale } from "@/i18n/locales";

type DailyReportEmailParams = {
  recipientName: string;
  tenantName: string;
  dateLabel: string;
  contentMd: string;
  reportUrl: string;
  /** Locale of the recipient. Resolved per-tenant by the caller. */
  locale: Locale;
};

type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export async function dailyReportEmailTemplate({
  recipientName,
  tenantName,
  dateLabel,
  contentMd,
  reportUrl,
  locale,
}: DailyReportEmailParams): Promise<EmailTemplate> {
  const t = await getTranslations({ locale, namespace: "emails.dailyReport" });
  const tShell = await getTranslations({ locale, namespace: "emails.shell" });

  const subject = `AdsLab Daily — ${tenantName} — ${dateLabel}`;
  const bodyHtml = renderMarkdown(contentMd, { emailStyles: true });

  const html = `<!doctype html>
<html lang="${locale}">
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
                <p style="margin:4px 0 0 0;font-size:12px;color:#71717A;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(t("header"))}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 8px 40px;">
                <h1 style="margin:0;font-size:22px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em;line-height:1.3;">${escapeHtml(t("greeting", { name: recipientName }))}</h1>
                <p style="margin:8px 0 0 0;font-size:14px;color:#52525B;">
                  ${t.raw("subtitle")
                    .replace("{tenantName}", `<strong style="color:#0A0A0A;">${escapeHtml(tenantName)}</strong>`)
                    .replace("{dateLabel}", escapeHtml(dateLabel))}
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
                        ${escapeHtml(t("cta"))}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 32px 40px;border-top:1px solid #F4F4F5;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#A1A1AA;">
                  ${t.raw("footerNotice")}
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0 0;font-size:12px;color:#A1A1AA;">
            AdsLab · ${escapeHtml(tShell("tagline"))}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${t("text.greeting", { name: recipientName })}

${t("text.subtitle", { tenantName, dateLabel })}

${contentMd}

${t("text.readOnWeb", { url: reportUrl })}

${t("text.signoff")}`;

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}
