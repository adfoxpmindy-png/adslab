/**
 * Billing email templates. Locale-aware via next-intl: caller passes
 * the recipient's preferred locale; all subject/html/text strings are
 * pulled from `messages/<locale>.json` under the `emails.billing.*`
 * namespace.
 *
 * Currency / number values use `formatNumber(value, locale)` so the
 * Thai grouping separator only appears in `th` output; other locales
 * get their native grouping.
 */
import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/locales";
import { formatNumber } from "@/lib/i18n/format";

type EmailTemplate = { subject: string; html: string; text: string };

async function shell(
  locale: Locale,
  opts: {
    title: string;
    bodyHtml: string;
    ctaLabel?: string;
    ctaUrl?: string;
    bodyText: string;
  },
): Promise<{ html: string; text: string }> {
  const tShell = await getTranslations({ locale, namespace: "emails.shell" });
  const fontStack = fontStackFor(locale);
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<tr><td style="padding:32px 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background-color:#06B6D4;border-radius:8px;"><a href="${escapeHtmlAttr(opts.ctaUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;letter-spacing:-0.005em;">${escapeHtml(opts.ctaLabel)}</a></td></tr></table></td></tr>`
      : "";

  const html = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background-color:#FAFAFA;font-family:${fontStack};color:#0A0A0A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAFA;padding:48px 16px;">
<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;">
<tr><td style="padding:40px 40px 0 40px;"><div style="font-size:20px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em;">AdsLab</div></td></tr>
<tr><td style="padding:24px 40px 8px 40px;"><h1 style="margin:0;font-size:24px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em;line-height:1.3;">${escapeHtml(opts.title)}</h1></td></tr>
<tr><td style="padding:0 40px 16px 40px;">${opts.bodyHtml}</td></tr>
${cta}
<tr><td style="padding:24px 40px 40px 40px;border-top:1px solid #F4F4F5;"><p style="margin:24px 0 0 0;font-size:12px;line-height:1.6;color:#A1A1AA;">AdsLab · ${escapeHtml(tShell("tagline"))}</p></td></tr>
</table></td></tr></table></body></html>`;

  const text = `${opts.title}

${opts.bodyText}${opts.ctaUrl ? `\n\n${opts.ctaUrl}\n` : ""}

${tShell("signoff")}`;

  return { html, text };
}

export async function trialReminder2dTemplate(opts: {
  name: string;
  planName: string;
  priceThb: number;
  dashboardUrl: string;
  locale: Locale;
}): Promise<EmailTemplate> {
  const { locale } = opts;
  const t = await getTranslations({
    locale,
    namespace: "emails.billing.trialReminder2d",
  });
  const price = formatNumber(opts.priceThb, locale);
  const subject = t("subject");
  const { html, text } = await shell(locale, {
    title: t("title"),
    bodyHtml: `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">${escapeHtml(t("greeting", { name: opts.name }))}</p><p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#52525B;">${t.raw("body").replace("{planName}", escapeHtml(opts.planName)).replace("{price}", price)}</p><p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#71717A;">${escapeHtml(t("manageHint"))}</p>`,
    ctaLabel: t("cta"),
    ctaUrl: opts.dashboardUrl,
    bodyText: `${t("text.greeting", { name: opts.name })}\n\n${t("text.body", { planName: opts.planName, price })}\n\n${t("text.manageHint")}`,
  });
  return { subject, html, text };
}

export async function trialReminder1dTemplate(opts: {
  name: string;
  planName: string;
  priceThb: number;
  dashboardUrl: string;
  locale: Locale;
}): Promise<EmailTemplate> {
  const { locale } = opts;
  const t = await getTranslations({
    locale,
    namespace: "emails.billing.trialReminder1d",
  });
  const price = formatNumber(opts.priceThb, locale);
  const subject = t("subject");
  const { html, text } = await shell(locale, {
    title: t("title"),
    bodyHtml: `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">${escapeHtml(t("greeting", { name: opts.name }))}</p><p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#52525B;">${t.raw("body").replace("{price}", price).replace("{planName}", escapeHtml(opts.planName))}</p>`,
    ctaLabel: t("cta"),
    ctaUrl: opts.dashboardUrl,
    bodyText: `${t("text.greeting", { name: opts.name })}\n\n${t("text.body", { planName: opts.planName, price })}`,
  });
  return { subject, html, text };
}

export async function invoicePaidTemplate(opts: {
  name: string;
  amountThb: number;
  vatThb: number;
  baseThb: number;
  planName: string;
  invoiceUrl: string;
  locale: Locale;
}): Promise<EmailTemplate> {
  const { locale } = opts;
  const t = await getTranslations({
    locale,
    namespace: "emails.billing.invoicePaid",
  });
  const amount = formatNumber(opts.amountThb, locale);
  const base = formatNumber(opts.baseThb, locale);
  const vat = formatNumber(opts.vatThb, locale);
  const subject = t("subject", { amount });
  const amountUnit = (v: string) => t("amountUnit", { amount: v });

  const { html, text } = await shell(locale, {
    title: t("title"),
    bodyHtml: `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">${escapeHtml(t("greeting", { name: opts.name }))}</p><p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#52525B;">${escapeHtml(t("body"))}</p><table style="margin-top:20px;width:100%;border-collapse:collapse;font-size:14px;color:#3F3F46;"><tr><td style="padding:8px 0;border-bottom:1px solid #F4F4F5;">${escapeHtml(t("rowPlan"))}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #F4F4F5;font-weight:600;">${escapeHtml(opts.planName)}</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid #F4F4F5;">${escapeHtml(t("rowBase"))}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #F4F4F5;">${escapeHtml(amountUnit(base))}</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid #F4F4F5;">${escapeHtml(t("rowVat"))}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #F4F4F5;">${escapeHtml(amountUnit(vat))}</td></tr><tr><td style="padding:12px 0;font-weight:700;color:#0A0A0A;">${escapeHtml(t("rowTotal"))}</td><td align="right" style="padding:12px 0;font-weight:700;color:#0A0A0A;">${escapeHtml(amountUnit(amount))}</td></tr></table>`,
    ctaLabel: t("cta"),
    ctaUrl: opts.invoiceUrl,
    bodyText: `${t("text.greeting", { name: opts.name })}\n\n${t("text.body", { amount, planName: opts.planName })}`,
  });
  return { subject, html, text };
}

export async function invoiceFailedTemplate(opts: {
  name: string;
  amountThb: number;
  reason: string;
  retryUrl: string;
  locale: Locale;
}): Promise<EmailTemplate> {
  const { locale } = opts;
  const t = await getTranslations({
    locale,
    namespace: "emails.billing.invoiceFailed",
  });
  const amount = formatNumber(opts.amountThb, locale);
  const subject = t("subject");
  const { html, text } = await shell(locale, {
    title: t("title"),
    bodyHtml: `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">${escapeHtml(t("greeting", { name: opts.name }))}</p><p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#52525B;">${t.raw("body").replace("{amount}", amount)}</p><p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#71717A;">${escapeHtml(t("reasonLabel", { reason: opts.reason }))}</p><p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#71717A;">${escapeHtml(t("graceNotice"))}</p>`,
    ctaLabel: t("cta"),
    ctaUrl: opts.retryUrl,
    bodyText: `${t("text.greeting", { name: opts.name })}\n\n${t("text.body", { amount })}\n\n${t("text.reasonLabel", { reason: opts.reason })}\n\n${t("text.graceNotice")}`,
  });
  return { subject, html, text };
}

export async function subscriptionCancelledTemplate(opts: {
  name: string;
  accessUntil: string;
  resubscribeUrl: string;
  locale: Locale;
}): Promise<EmailTemplate> {
  const { locale } = opts;
  const t = await getTranslations({
    locale,
    namespace: "emails.billing.subscriptionCancelled",
  });
  const subject = t("subject");
  const { html, text } = await shell(locale, {
    title: t("title"),
    bodyHtml: `<p style="margin:16px 0 0 0;font-size:16px;line-height:1.6;color:#52525B;">${escapeHtml(t("greeting", { name: opts.name }))}</p><p style="margin:12px 0 0 0;font-size:15px;line-height:1.6;color:#52525B;">${t.raw("body").replace("{accessUntil}", escapeHtml(opts.accessUntil))}</p><p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#71717A;">${escapeHtml(t("resubscribeNotice"))}</p>`,
    ctaLabel: t("cta"),
    ctaUrl: opts.resubscribeUrl,
    bodyText: `${t("text.greeting", { name: opts.name })}\n\n${t("text.body", { accessUntil: opts.accessUntil })}`,
  });
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
