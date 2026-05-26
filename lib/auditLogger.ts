import type { Prisma, PrismaClient } from "@prisma/client";

type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function logAudit(
  client: AuditClient,
  eventId: string,
  message: string,
  metadata?: Prisma.InputJsonValue
) {
  return client.auditLog.create({
    data: {
      eventId,
      message,
      metadata
    }
  });
}
