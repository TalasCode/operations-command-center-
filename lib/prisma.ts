import { PrismaClient } from "@prisma/client";

declare global {
  var __operationsPrisma: PrismaClient | undefined;
}

export function createPrismaClient(url?: string) {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

export const prisma =
  globalThis.__operationsPrisma ?? createPrismaClient(process.env.DATABASE_URL);

if (process.env.NODE_ENV !== "production") {
  globalThis.__operationsPrisma = prisma;
}
