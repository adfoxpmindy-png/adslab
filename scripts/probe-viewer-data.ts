import { prisma } from "@/lib/prisma";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" }, select: { id: true, name: true } });
  if (!tenant) { console.log("no demo tenant"); return; }
  const accountCount = await prisma.metaAdAccount.count({ where: { connection: { tenantId: tenant.id } } });
  const campCount = await prisma.metaCampaign.count({ where: { connection: { tenantId: tenant.id } } });
  const adCount = await prisma.metaAd.count({ where: { adSet: { campaign: { connection: { tenantId: tenant.id } } } } });
  const activeAdCount = await prisma.metaAd.count({ where: { effectiveStatus: "ACTIVE", adSet: { campaign: { connection: { tenantId: tenant.id } } } } });
  const adsWithCreative = await prisma.metaAd.count({ where: { creativeId: { not: null }, effectiveStatus: "ACTIVE", adSet: { campaign: { connection: { tenantId: tenant.id } } } } });
  console.log(JSON.stringify({ tenant, accountCount, campCount, adCount, activeAdCount, adsWithCreative }, null, 2));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
