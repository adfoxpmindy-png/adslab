"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Tenant = { slug: string; name: string };

type TenantSwitcherProps = {
  currentSlug: string;
  tenants: Tenant[];
};

export function TenantSwitcher({ currentSlug, tenants }: TenantSwitcherProps) {
  const router = useRouter();
  const current = tenants.find((t) => t.slug === currentSlug) ?? tenants[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5 max-w-[200px] justify-between" />
        }
      >
        <span className="truncate font-medium">{current?.name ?? "(ไม่พบ workspace)"}</span>
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
