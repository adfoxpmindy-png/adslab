import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { requireTenantMember } from "@/lib/auth/tenant";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  await requireTenantMember(tenantSlug);
  const t = await getTranslations("pages.settings");

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("eyebrow")}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2 border-b border-border text-sm">
        <SettingsTab href={`/t/${tenantSlug}/settings/integrations`} label="Integrations" />
        <SettingsTab href={`/t/${tenantSlug}/settings/billing`} label="Billing" />
        <SettingsTab href={`/t/${tenantSlug}/settings/team`} label="Team" disabled comingSoonLabel={t("comingSoon")} />
        <SettingsTab href={`/t/${tenantSlug}/settings/account`} label="Account" disabled comingSoonLabel={t("comingSoon")} />
      </nav>

      <div>{children}</div>
    </div>
  );
}

function SettingsTab({
  href,
  label,
  disabled,
  comingSoonLabel,
}: {
  href: string;
  label: string;
  disabled?: boolean;
  comingSoonLabel?: string;
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-muted-foreground/60">
        {label} <span className="text-[10px] uppercase">{comingSoonLabel}</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="border-b-2 border-foreground px-3 py-2 font-medium text-foreground"
    >
      {label}
    </Link>
  );
}
