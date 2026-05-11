import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";

// Load secrets from .env.local before reading process.env in main()
config({ path: ".env.local" });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log("🌱 Seeding AdsLab database...");

  // ----- Admin user -----
  const passwordHash = await bcrypt.hash("admin123", 10);

  const user = await prisma.user.upsert({
    where: { email: "test@test.com" },
    update: {
      passwordHash,
      name: "Test Admin",
      emailVerifiedAt: new Date(),
    },
    create: {
      email: "test@test.com",
      passwordHash,
      name: "Test Admin",
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`  ✓ User: ${user.email} (id: ${user.id})`);

  // ----- Demo tenant -----
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { name: "AdsLab Demo Agency" },
    create: {
      name: "AdsLab Demo Agency",
      slug: "demo",
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} (slug: ${tenant.slug})`);

  // ----- Membership (Owner) -----
  const membership = await prisma.tenantMember.upsert({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: tenant.id,
      },
    },
    update: { role: "OWNER" },
    create: {
      userId: user.id,
      tenantId: tenant.id,
      role: "OWNER",
    },
  });
  console.log(`  ✓ Membership: ${membership.role}`);

  console.log("\n🎉 Seed complete!");
  console.log("   Login with: test@test.com / admin123");
  console.log("   Tenant URL: /t/demo/dashboard\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
