"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Tenant = { slug: string; name: string };

type TenantSwitcherProps = {
  currentSlug: string;
  tenants: Tenant[];
};

export function TenantSwitcher({ currentSlug, tenants }: TenantSwitcherProps) {
  const router = useRouter();
  const t = useTranslations("tenantSwitcher");
  const current = tenants.find((x) => x.slug === currentSlug) ?? tenants[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-1.5 max-w-[200px] justify-between",
        )}
      >
        <span className="truncate font-medium">{current?.name ?? t("notFound")}</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide">
          Workspaces
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.slug}
            onClick={() => {
              if (tenant.slug !== currentSlug) {
                router.push(`/t/${tenant.slug}/dashboard`);
              }
            }}
          >
            <span className="flex-1 truncate">{tenant.name}</span>
            {tenant.slug === currentSlug && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
