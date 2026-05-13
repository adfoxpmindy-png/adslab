import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
(async () => {
  const p = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
  });
  const acc = await p.metaAdAccount.findFirst({
    where: { accountStatus: 1 },
    select: { metaAccountId: true, name: true, businessName: true },
  });
  console.log("Test script picks (findFirst with accountStatus=1):", acc);
  process.exit(0);
})();
