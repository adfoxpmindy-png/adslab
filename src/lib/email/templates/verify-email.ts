/**
 * Verify-email template. Locale-aware via next-intl: caller passes the
 * recipient's preferred locale; subject/html/text are pulled from
 * `messages/<locale>.json` under the `emails.verifyEmail.*` namespace.
 */
import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/locales";

type VerifyEmailParams = {
  name: string;
  verifyUrl: string;
  locale: Locale;
};

type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export async function verifyEmailTemplate({
  name,
  verifyUrl,
  locale,
}: VerifyEmailParams): Promise<EmailTemplate> {
  const t = await getTranslations({ locale, namespace: "emails.verifyEmail" });
  const tShell = await getTranslations({ locale, namespace: "emails.shell" });

  const subject = t("subject");
  const safeUrl = escapeHtml(verifyUrl);
  const safeUrlAttr = escapeHtmlAttr(verifyUrl);

  const fontStack = fontStackFor(locale);
  const htmlLang = locale;

  const html = `<!doctype html>
<html lang="${htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#FAFAFA;font-family:${fontStack};color:#0A0A0A;">
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
                <h1 style="margin:0;font-size:24px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em;line-height:1.3;">${escapeHtml(t("greeting", { name }))}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px;">
                <p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">
                  ${escapeHtml(t("body"))}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="background-color:#06B6D4;border-radius:8px;">
                      <a href="${safeUrlAttr}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:-0.005em;">
                        ${escapeHtml(t("cta"))}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 8px 40px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#71717A;">
                  ${escapeHtml(t("linkHint"))}
                </p>
                <p style="margin:8px 0 0 0;font-size:13px;line-height:1.5;color:#06B6D4;word-break:break-all;">
                  ${safeUrl}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 40px 40px;border-top:1px solid #F4F4F5;margin-top:32px;">
                <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#A1A1AA;">
                  ${escapeHtml(t("expiry"))}<br />
                  ${escapeHtml(t("ignoreNotice"))}
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

  const text = `${t("text.greeting", { name })}

${t("text.body")}

${verifyUrl}

${t("expiry")}
${t("ignoreNotice")}

${tShell("signoff")}`;

  return { subject, html, text };
}

function fontStackFor(locale: Locale): string {
  if (locale === "th" || locale === "lo") {
    return "-apple-system,BlinkMacSystemFont,'Segoe UI','IBM Plex Sans Thai',Inter,Roboto,sans-serif";
  }
  return "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
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
