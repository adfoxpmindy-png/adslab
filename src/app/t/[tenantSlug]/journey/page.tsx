import { Compass } from "lucide-react";

import { requireTenantMember } from "@/lib/auth/tenant";
import { JourneyCanvas } from "@/components/tenant/journey/journey-canvas";

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  await requireTenantMember(tenantSlug);

  return (
    <div className="flex h-[calc(100vh-6rem)] w-full flex-col">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-3 px-6 py-4">
        <header className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10">
            <Compass className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Journey
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Customer Journey</h1>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <JourneyCanvas tenantSlug={tenantSlug} />
        </div>
      </div>
    </div>
  );
}
