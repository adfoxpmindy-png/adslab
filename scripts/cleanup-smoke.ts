import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
(async () => {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
  const r = await p.reportScope.deleteMany({ where: { name: { startsWith: "[smoke" } } });
  console.log("deleted scopes:", r.count);
  process.exit(0);
})();
