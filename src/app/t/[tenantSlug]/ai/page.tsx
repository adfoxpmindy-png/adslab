import { Bot } from "lucide-react";

import { requireTenantMember } from "@/lib/auth/tenant";
import { AIPageClient } from "@/components/tenant/ai-page-client";

export default async function AIPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { tenantSlug } = await params;
  const { c } = await searchParams;
  await requireTenantMember(tenantSlug);

  return (
    <div className="h-[calc(100vh-6rem)] w-full">
      <div className="mx-auto flex h-full w-full max-w-screen-2xl flex-col px-6 py-4">
        <header className="mb-3 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
            <Bot className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              AI
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">AI Master</h1>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <AIPageClient
            tenantSlug={tenantSlug}
            initialConversationId={c ?? null}
          />
        </div>
      </div>
    </div>
  );
}
