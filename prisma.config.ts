import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load secrets from .env.local (Next.js convention) instead of .env
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx ./prisma/seed.ts",
  },
  datasource: {
    // Use the direct (non-pooled) Neon URL for migrations when available;
    // the runtime PrismaClient connects via PrismaNeon adapter using the
    // pooled DATABASE_URL (see src/lib/prisma.ts).
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
