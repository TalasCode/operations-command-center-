import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { campaignAdapter } from "@/adapters/campaignAdapter";
import { createPrismaClient } from "@/lib/prisma";
import { WorkflowEngine } from "@/workflow/workflowEngine";

const db = createPrismaClient(process.env.DATABASE_URL);
const engine = new WorkflowEngine({ db });

async function resetDatabase() {
  await db.auditLog.deleteMany();
  await db.reviewQueueItem.deleteMany();
  await db.action.deleteMany();
  await db.event.deleteMany();
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
  await db.$disconnect();
});

describe("WorkflowEngine", () => {
  test("FinanceOps event succeeds", async () => {
    const result = await engine.processEvent({
      source_event_id: "finance-001",
      source: "financeops",
      event_type: "invoice.overdue",
      payload: {
        invoice_id: "INV-9281",
        customer_name: "Acme Trading",
        amount: 4200,
        currency: "USD",
        days_overdue: 17
      }
    });

    expect(result.duplicate).toBe(false);
    expect(result.event?.status).toBe("completed");
    expect(result.event?.actions).toHaveLength(2);
    expect(result.event?.actions[0]?.payload).toMatchObject({ priority: "high" });
  });

  test("CampaignOps event succeeds", async () => {
    const result = await engine.processEvent({
      source_event_id: "campaign-001",
      source: "campaignops",
      event_type: "client_brief.received",
      payload: {
        client: "Luna Cafe",
        campaign_goal: "Launch Ramadan catering offer",
        channels: ["instagram", "email", "landing_page"],
        deadline: "2026-06-10"
      }
    });

    expect(result.event?.status).toBe("completed");
    expect(result.event?.actions).toHaveLength(3);
    expect(result.event?.actions[0]?.type).toBe("create_campaign_task");
    expect(result.event?.actions[1]?.payload).toMatchObject({ deadline: "2026-06-10" });
  });

  test("GuestOps event succeeds", async () => {
    const result = await engine.processEvent({
      source_event_id: "guest-001",
      source: "guestops",
      event_type: "reservation.change_requested",
      payload: {
        reservation_id: "RES-7729",
        guest_name: "Maya Haddad",
        current_check_in: "2026-06-04",
        requested_check_in: "2026-06-06",
        nights: 3
      }
    });

    expect(result.event?.status).toBe("completed");
    expect(result.event?.actions).toHaveLength(2);
    const guestMessageAction = result.event?.actions.find(
      (action) => action.type === "generate_guest_message"
    );
    expect(guestMessageAction?.payload).toMatchObject({
      message: "Hi Maya Haddad, we received your request to change your check-in date to 2026-06-06."
    });
  });

  test("Duplicate event does not create duplicate actions", async () => {
    await engine.processEvent({
      source_event_id: "finance-001",
      source: "financeops",
      event_type: "invoice.overdue",
      payload: {
        invoice_id: "INV-9281",
        customer_name: "Acme Trading",
        amount: 4200,
        currency: "USD",
        days_overdue: 17
      }
    });

    const duplicate = await engine.processEvent({
      source_event_id: "finance-001",
      source: "financeops",
      event_type: "invoice.overdue",
      payload: {
        invoice_id: "INV-9281",
        customer_name: "Acme Trading",
        amount: 4200,
        currency: "USD",
        days_overdue: 17
      }
    });

    const actionCount = await db.action.count();
    const eventCount = await db.event.count();
    const duplicateAuditLogs = await db.auditLog.findMany({
      where: {
        event: {
          sourceEventId: "finance-001"
        },
        message: {
          contains: "Duplicate event ignored"
        }
      }
    });

    expect(duplicate.duplicate).toBe(true);
    expect(actionCount).toBe(2);
    expect(eventCount).toBe(1);
    expect(duplicate.event?.sourceEventId).toBe("finance-001");
    expect(duplicateAuditLogs).toHaveLength(1);
  });

  test("Missing required field goes to review", async () => {
    const result = await engine.processEvent({
      source_event_id: "finance-002",
      source: "financeops",
      event_type: "invoice.overdue",
      payload: {
        customer_name: "Acme Trading",
        amount: 4200,
        currency: "USD",
        days_overdue: 17
      }
    });

    const reviewItems = await db.reviewQueueItem.findMany();

    expect(result.event?.status).toBe("review_required");
    expect(result.event?.reviewRequired).toBe(true);
    expect(reviewItems).toHaveLength(1);
    expect(reviewItems[0]?.reason).toContain("Missing required FinanceOps fields");
  });

  test("Simulated external failure is handled correctly", async () => {
    const result = await engine.processEvent({
      source_event_id: "campaign-002",
      source: "campaignops",
      event_type: "client_brief.received",
      payload: {
        client: "Luna Cafe",
        campaign_goal: "Launch Ramadan catering offer",
        channels: ["instagram"],
        deadline: "2026-06-10",
        simulate_failure: true
      }
    });

    const reviewItems = await db.reviewQueueItem.findMany();
    const failedActions = await db.action.findMany({ where: { status: "failed" } });
    const failureAuditLogs = await db.auditLog.findMany({
      where: {
        event: {
          sourceEventId: "campaign-002"
        },
        message: {
          contains: "mock service"
        }
      }
    });

    expect(result.event?.status).toBe("failed");
    expect(result.event?.reviewRequired).toBe(true);
    expect(reviewItems).toHaveLength(1);
    expect(reviewItems[0]?.reason).toContain("Mock external service failure");
    expect(failedActions).toHaveLength(1);
    expect(failureAuditLogs.length).toBeGreaterThan(0);
    expect(result.event?.reviewItems.length).toBeGreaterThan(0);
  });

  test("Thrown mock service failure is caught and routed to review", async () => {
    const originalExecuteAction = campaignAdapter.executeAction;
    campaignAdapter.executeAction = async () => {
      throw new Error("CampaignOps mock service threw unexpectedly.");
    };

    try {
      const result = await engine.processEvent({
        source_event_id: "campaign-throw-001",
        source: "campaignops",
        event_type: "client_brief.received",
        payload: {
          client: "Luna Cafe",
          campaign_goal: "Launch Ramadan catering offer",
          channels: ["instagram"],
          deadline: "2026-06-10"
        }
      });

      const failedActions = await db.action.findMany({ where: { status: "failed" } });
      const reviewItems = await db.reviewQueueItem.findMany({
        where: {
          event: {
            sourceEventId: "campaign-throw-001"
          }
        }
      });

      expect(result.event?.status).toBe("failed");
      expect(result.event?.reviewRequired).toBe(true);
      expect(result.event?.lastError).toBe("One or more mock external actions failed.");
      expect(failedActions).toHaveLength(1);
      expect(reviewItems[0]?.reason).toContain("Mock external service failure");
    } finally {
      campaignAdapter.executeAction = originalExecuteAction;
    }
  });

  test("Human reviewer can correct payload and reprocess safely", async () => {
    const initial = await engine.processEvent({
      source_event_id: "campaign-reprocess-001",
      source: "campaignops",
      event_type: "client_brief.received",
      payload: {
        client: "Luna Cafe",
        campaign_goal: "Launch Ramadan catering offer",
        channels: ["instagram"],
        deadline: "2026-06-10",
        simulate_failure: true
      }
    });

    const reviewItemId = initial.event?.reviewItems[0]?.id;
    expect(reviewItemId).toBeTruthy();

    await engine.updateReviewItem(reviewItemId!, {
      action: "reprocess",
      correctedPayload: {
        client: "Luna Cafe",
        campaign_goal: "Launch Ramadan catering offer",
        channels: ["instagram"],
        deadline: "2026-06-10"
      },
      resolutionNotes: "Removed simulate_failure and retried."
    });

    const event = await db.event.findUniqueOrThrow({
      where: { sourceEventId: "campaign-reprocess-001" },
      include: {
        actions: { orderBy: { createdAt: "asc" } },
        reviewItems: { orderBy: { createdAt: "desc" } },
        auditLogs: { orderBy: { createdAt: "asc" } }
      }
    });

    const supersededActions = event.actions.filter((action) => action.status === "superseded");
    const executedActions = event.actions.filter((action) => action.status === "executed");
    const correctionAuditLogs = event.auditLogs.filter((log) =>
      log.message.includes("Payload corrected by human reviewer")
    );

    expect(event.status).toBe("completed");
    expect(event.reviewRequired).toBe(false);
    expect(event.reviewItems[0]?.status).toBe("resolved");
    expect(event.reviewItems[0]?.resolutionNotes).toBe("Removed simulate_failure and retried.");
    expect(supersededActions).toHaveLength(1);
    expect(executedActions).toHaveLength(1);
    expect(correctionAuditLogs).toHaveLength(1);
  });

  test("Unknown source is routed to review", async () => {
    const result = await engine.processEvent({
      source_event_id: "unknown-001",
      source: "unknown",
      event_type: "message.received",
      payload: {
        text: "Please move this to next Friday and tell the client it is confirmed."
      }
    });

    expect(result.event?.status).toBe("review_required");
    expect(result.event?.detectedStream).toBe("unknown");
    expect(result.event?.reviewItems[0]?.reason).toBe("Unable to determine workflow stream.");
  });
});
