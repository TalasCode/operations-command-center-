import { Prisma } from "@prisma/client";

import { logAudit } from "@/lib/auditLogger";
import { prisma } from "@/lib/prisma";
import { sampleEvents } from "@/lib/sampleEvents";
import { detectStream, getAdapterForStream } from "@/workflow/adapterRegistry";
import type {
  EventEnvelope,
  GeneratedAction,
  ReviewUpdateInput,
  SupportedStream,
  WorkflowStream
} from "@/workflow/types";

type EngineDependencies = {
  db?: typeof prisma;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function parseEnvelope(input: unknown):
  | { ok: true; event: EventEnvelope }
  | { ok: false; reason: string; partial: Record<string, unknown> } {
  if (!isObjectRecord(input)) {
    return {
      ok: false,
      reason: "Event must be a JSON object with source_event_id, source, event_type, and payload.",
      partial: {}
    };
  }

  const source_event_id = input.source_event_id;
  const source = input.source;
  const event_type = input.event_type;
  const payload = input.payload;

  if (
    typeof source_event_id !== "string" ||
    source_event_id.trim().length === 0 ||
    typeof source !== "string" ||
    source.trim().length === 0 ||
    typeof event_type !== "string" ||
    event_type.trim().length === 0 ||
    !isObjectRecord(payload)
  ) {
    return {
      ok: false,
      reason: "Event is missing one of the required envelope fields or payload is malformed.",
      partial: input
    };
  }

  return {
    ok: true,
    event: {
      source_event_id,
      source,
      event_type,
      payload
    }
  };
}

function toActionShape(action: {
  id: string;
  type: string;
  service: string;
  payload: Prisma.JsonValue;
}) {
  return {
    id: action.id,
    type: action.type,
    service: action.service as SupportedStream,
    payload: action.payload as Record<string, unknown>
  };
}

function getFailureMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function toEventEnvelope(event: {
  sourceEventId: string;
  source: string;
  eventType: string;
  payload: Prisma.JsonValue;
}): EventEnvelope {
  return {
    source_event_id: event.sourceEventId,
    source: event.source,
    event_type: event.eventType,
    payload: event.payload as Record<string, unknown>
  };
}

export class WorkflowEngine {
  private db: typeof prisma;

  constructor({ db = prisma }: EngineDependencies = {}) {
    this.db = db;
  }

  async processEvent(input: unknown) {
    const parsed = parseEnvelope(input);

    if (!parsed.ok) {
      const invalidSourceEventId =
        typeof parsed.partial.source_event_id === "string" && parsed.partial.source_event_id.trim()
          ? parsed.partial.source_event_id
          : `invalid-${crypto.randomUUID()}`;
      const stream = detectStream(parsed.partial.source);
      const event = await this.db.event.create({
        data: {
          sourceEventId: invalidSourceEventId,
          source: typeof parsed.partial.source === "string" ? parsed.partial.source : "unknown",
          eventType:
            typeof parsed.partial.event_type === "string" ? parsed.partial.event_type : "unknown",
          detectedStream: stream,
          payload: toJson(
            isObjectRecord(parsed.partial.payload) ? parsed.partial.payload : parsed.partial
          ),
          status: "review_required",
          reviewRequired: true
        }
      });

      await logAudit(this.db, event.id, "Event stored for manual review.", {
        reason: parsed.reason
      });
      await this.ensureOpenReviewItem(event.id, parsed.reason);

      return {
        duplicate: false,
        event: await this.getEventDetail(event.id)
      };
    }

    const existing = await this.db.event.findUnique({
      where: { sourceEventId: parsed.event.source_event_id }
    });

    if (existing) {
      await logAudit(this.db, existing.id, "Duplicate event ignored.", {
        source_event_id: parsed.event.source_event_id
      });

      return {
        duplicate: true,
        event: await this.getEventDetail(existing.id)
      };
    }

    const stream = detectStream(parsed.event.source);

    let createdEvent;

    try {
      createdEvent = await this.db.event.create({
        data: {
          sourceEventId: parsed.event.source_event_id,
          source: parsed.event.source,
          eventType: parsed.event.event_type,
          detectedStream: stream,
          payload: toJson(parsed.event.payload),
          status: "received"
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const duplicate = await this.db.event.findUnique({
          where: { sourceEventId: parsed.event.source_event_id }
        });

        if (duplicate) {
          await logAudit(this.db, duplicate.id, "Duplicate event ignored after unique check.", {
            source_event_id: parsed.event.source_event_id
          });

          return {
            duplicate: true,
            event: await this.getEventDetail(duplicate.id)
          };
        }
      }

      throw error;
    }

    await logAudit(this.db, createdEvent.id, "Event received.", {
      source: parsed.event.source,
      event_type: parsed.event.event_type
    });

    return {
      duplicate: false,
      event: await this.runWorkflowForStoredEvent(createdEvent.id, parsed.event)
    };
  }

  async listEvents(filters?: {
    stream?: string;
    status?: string;
    search?: string;
    review?: string;
  }) {
    const items = await this.db.event.findMany({
      where: {
        detectedStream: filters?.stream && filters.stream !== "all" ? filters.stream : undefined,
        status: filters?.status && filters.status !== "all" ? filters.status : undefined,
        reviewRequired:
          filters?.review === "true" ? true : filters?.review === "false" ? false : undefined,
        OR:
          filters?.search && filters.search.trim().length > 0
            ? [
                { sourceEventId: { contains: filters.search } },
                { eventType: { contains: filters.search } },
                { source: { contains: filters.search } }
              ]
            : undefined
      },
      include: {
        reviewItems: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return items.map((event) => ({
      id: event.id,
      sourceEventId: event.sourceEventId,
      source: event.source,
      eventType: event.eventType,
      detectedStream: event.detectedStream,
      status: event.status,
      reviewRequired: event.reviewRequired,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      reviewReason: event.reviewItems[0]?.reason ?? null
    }));
  }

  async getEventDetail(id: string) {
    const event = await this.db.event.findUnique({
      where: { id },
      include: {
        actions: { orderBy: { createdAt: "asc" } },
        reviewItems: { orderBy: { createdAt: "desc" } },
        auditLogs: { orderBy: { createdAt: "asc" } }
      }
    });

    if (!event) {
      return null;
    }

    return {
      id: event.id,
      sourceEventId: event.sourceEventId,
      source: event.source,
      eventType: event.eventType,
      detectedStream: event.detectedStream,
      payload: event.payload,
      status: event.status,
      reviewRequired: event.reviewRequired,
      lastError: event.lastError,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      actions: event.actions.map((action) => ({
        id: action.id,
        type: action.type,
        service: action.service,
        status: action.status,
        payload: action.payload,
        createdAt: action.createdAt,
        updatedAt: action.updatedAt
      })),
      reviewItems: event.reviewItems.map((item) => ({
        id: item.id,
        reason: item.reason,
        status: item.status,
        resolutionNotes: item.resolutionNotes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        resolvedAt: item.resolvedAt
      })),
      auditLogs: event.auditLogs.map((log) => ({
        id: log.id,
        message: log.message,
        metadata: log.metadata,
        createdAt: log.createdAt
      }))
    };
  }

  async getDashboardData() {
    const [totalEvents, completedEvents, reviewEvents, failedEvents, openReviewItems, recentActivity] =
      await Promise.all([
        this.db.event.count(),
        this.db.event.count({ where: { status: "completed" } }),
        this.db.event.count({ where: { reviewRequired: true } }),
        this.db.event.count({ where: { status: "failed" } }),
        this.db.reviewQueueItem.count({ where: { status: "open" } }),
        this.db.auditLog.findMany({
          include: { event: true },
          orderBy: { createdAt: "desc" },
          take: 12
        })
      ]);

    return {
      totals: {
        totalEvents,
        completedEvents,
        reviewEvents,
        failedEvents,
        openReviewItems
      },
      recentActivity: recentActivity.map((item) => ({
        id: item.id,
        eventId: item.eventId,
        sourceEventId: item.event.sourceEventId,
        message: item.message,
        metadata: item.metadata,
        createdAt: item.createdAt
      }))
    };
  }

  async listReviewQueue() {
    const items = await this.db.reviewQueueItem.findMany({
      where: { status: "open" },
      include: {
        event: {
          include: {
            actions: { orderBy: { createdAt: "asc" } },
            auditLogs: { orderBy: { createdAt: "asc" } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return items.map((item) => ({
      id: item.id,
      reason: item.reason,
      status: item.status,
      resolutionNotes: item.resolutionNotes,
      createdAt: item.createdAt,
      resolvedAt: item.resolvedAt,
      event: {
        id: item.event.id,
        sourceEventId: item.event.sourceEventId,
        source: item.event.source,
        eventType: item.event.eventType,
        detectedStream: item.event.detectedStream,
        payload: item.event.payload,
        status: item.event.status,
        reviewRequired: item.event.reviewRequired,
        lastError: item.event.lastError,
        createdAt: item.event.createdAt,
        actions: item.event.actions.map((action) => ({
          id: action.id,
          type: action.type,
          service: action.service,
          status: action.status,
          payload: action.payload
        })),
        auditLogs: item.event.auditLogs.map((log) => ({
          id: log.id,
          message: log.message,
          metadata: log.metadata,
          createdAt: log.createdAt
        }))
      }
    }));
  }

  async updateReviewItem(id: string, input: ReviewUpdateInput) {
    const reviewItem = await this.db.reviewQueueItem.findUnique({
      where: { id },
      include: {
        event: {
          include: {
            actions: { orderBy: { createdAt: "asc" } }
          }
        }
      }
    });

    if (!reviewItem) {
      return null;
    }

    if (input.action !== "reprocess" && input.editedActions?.length) {
      for (const editedAction of input.editedActions) {
        if (!editedAction.id) {
          continue;
        }

        await this.db.action.update({
          where: { id: editedAction.id },
          data: {
            type: editedAction.type,
            service: editedAction.service,
            payload: toJson(editedAction.payload),
            status: "edited"
          }
        });
      }

      await logAudit(this.db, reviewItem.eventId, "Operator edited generated actions.", {
        actionCount: input.editedActions.length
      });
    }

    if (input.action === "update") {
      await this.db.reviewQueueItem.update({
        where: { id },
        data: { resolutionNotes: input.resolutionNotes ?? reviewItem.resolutionNotes }
      });
      await logAudit(this.db, reviewItem.eventId, "Review notes updated.", {
        hasNotes: Boolean(input.resolutionNotes)
      });

      return this.getReviewQueueItem(id);
    }

    if (input.action === "reprocess") {
      if (!isObjectRecord(input.correctedPayload)) {
        throw new Error("Corrected payload must be a JSON object.");
      }

      await this.db.event.update({
        where: { id: reviewItem.eventId },
        data: {
          payload: toJson(input.correctedPayload),
          status: "received",
          reviewRequired: true,
          lastError: null
        }
      });
      await this.db.reviewQueueItem.update({
        where: { id },
        data: {
          status: "open",
          resolutionNotes: input.resolutionNotes ?? reviewItem.resolutionNotes,
          resolvedAt: null
        }
      });
      await logAudit(this.db, reviewItem.eventId, "Payload corrected by human reviewer.", {
        reviewItemId: id
      });
      await logAudit(this.db, reviewItem.eventId, "Reprocessing corrected event payload.", {
        reviewItemId: id
      });

      const event = await this.runWorkflowForStoredEvent(reviewItem.eventId, {
        source_event_id: reviewItem.event.sourceEventId,
        source: reviewItem.event.source,
        event_type: reviewItem.event.eventType,
        payload: input.correctedPayload
      }, {
        isReprocess: true
      });

      if (event?.status === "completed") {
        await this.db.reviewQueueItem.update({
          where: { id },
          data: {
            status: "resolved",
            resolutionNotes: input.resolutionNotes ?? reviewItem.resolutionNotes,
            resolvedAt: new Date()
          }
        });
        await logAudit(this.db, reviewItem.eventId, "Corrected payload reprocessed successfully.", {
          reviewItemId: id
        });
      } else {
        const latestReviewReason = event?.reviewItems[0]?.reason ?? "Event still requires review.";
        await this.db.reviewQueueItem.update({
          where: { id },
          data: {
            status: "open",
            reason: latestReviewReason,
            resolutionNotes: input.resolutionNotes ?? reviewItem.resolutionNotes,
            resolvedAt: null
          }
        });
        await logAudit(this.db, reviewItem.eventId, "Corrected payload still requires review.", {
          reviewItemId: id,
          reason: latestReviewReason
        });
      }

      return this.getReviewQueueItem(id);
    }

    if (input.action === "reject") {
      await this.db.reviewQueueItem.update({
        where: { id },
        data: {
          status: "rejected",
          resolutionNotes: input.resolutionNotes ?? reviewItem.resolutionNotes,
          resolvedAt: new Date()
        }
      });
      await this.db.event.update({
        where: { id: reviewItem.eventId },
        data: { status: "failed", reviewRequired: false, lastError: "Rejected during human review." }
      });
      await logAudit(this.db, reviewItem.eventId, "Operator rejected the event.", {
        resolutionNotes: input.resolutionNotes
      });

      return this.getReviewQueueItem(id);
    }

    if (input.action === "resolve") {
      await this.db.reviewQueueItem.update({
        where: { id },
        data: {
          status: "resolved",
          resolutionNotes: input.resolutionNotes ?? reviewItem.resolutionNotes,
          resolvedAt: new Date()
        }
      });
      await this.db.event.update({
        where: { id: reviewItem.eventId },
        data: { status: "completed", reviewRequired: false, lastError: null }
      });
      await logAudit(this.db, reviewItem.eventId, "Review item manually resolved.", {
        resolutionNotes: input.resolutionNotes
      });

      return this.getReviewQueueItem(id);
    }

    const latestActions = await this.db.action.findMany({
      where: { eventId: reviewItem.eventId },
      orderBy: { createdAt: "asc" }
    });
    const stream = detectStream(reviewItem.event.source);
    const adapter = getAdapterForStream(stream);

    if (!adapter || latestActions.length === 0) {
      await this.db.reviewQueueItem.update({
        where: { id },
        data: {
          status: "resolved",
          resolutionNotes: input.resolutionNotes ?? reviewItem.resolutionNotes,
          resolvedAt: new Date()
        }
      });
      await this.db.event.update({
        where: { id: reviewItem.eventId },
        data: { status: "completed", reviewRequired: false, lastError: null }
      });
      await logAudit(this.db, reviewItem.eventId, "Operator resolved a non-automated review item.");

      return this.getReviewQueueItem(id);
    }

    let hasFailure = false;

    const eventEnvelope = toEventEnvelope(reviewItem.event);

    for (const record of latestActions) {
      const action: GeneratedAction = toActionShape(record);
      let execution;

      try {
        execution = await adapter.executeAction(action, eventEnvelope);
      } catch (error) {
        const message = getFailureMessage(
          error,
          `Mock external service failure while retrying ${action.type}.`
        );

        execution = {
          success: false,
          message,
          metadata: {
            actionType: action.type,
            service: action.service,
            failureKind: "thrown_error"
          }
        };
      }

      await this.db.action.update({
        where: { id: record.id },
        data: { status: execution.success ? "executed" : "failed" }
      });
      await logAudit(this.db, reviewItem.eventId, `Review approval retried ${action.type}.`, {
        success: execution.success,
        ...execution.metadata
      });

      if (!execution.success) {
        hasFailure = true;
      }
    }

    if (hasFailure) {
      await this.db.event.update({
        where: { id: reviewItem.eventId },
        data: {
          status: "failed",
          reviewRequired: true,
          lastError: "Approved retry still failed."
        }
      });
      await logAudit(this.db, reviewItem.eventId, "Approved actions failed again and remain in review.");

      return this.getReviewQueueItem(id);
    }

    await this.db.reviewQueueItem.update({
      where: { id },
      data: {
        status: "approved",
        resolutionNotes: input.resolutionNotes ?? reviewItem.resolutionNotes,
        resolvedAt: new Date()
      }
    });
    await this.db.event.update({
      where: { id: reviewItem.eventId },
      data: { status: "completed", reviewRequired: false, lastError: null }
    });
    await logAudit(this.db, reviewItem.eventId, "Operator approved the generated actions.", {
      resolutionNotes: input.resolutionNotes
    });

    return this.getReviewQueueItem(id);
  }

  getSampleEvents() {
    return sampleEvents;
  }

  private async runWorkflowForStoredEvent(
    eventId: string,
    event: EventEnvelope,
    options?: { isReprocess?: boolean }
  ) {
    const stream = detectStream(event.source);

    await this.db.event.update({
      where: { id: eventId },
      data: {
        source: event.source,
        eventType: event.event_type,
        detectedStream: stream,
        payload: toJson(event.payload)
      }
    });

    if (stream === "unknown") {
      await this.db.event.update({
        where: { id: eventId },
        data: {
          status: "review_required",
          reviewRequired: true,
          lastError: null
        }
      });
      await logAudit(
        this.db,
        eventId,
        options?.isReprocess
          ? "Corrected payload still maps to an unknown workflow stream."
          : "Unknown workflow stream routed to review.",
        {
          source: event.source
        }
      );
      await this.ensureOpenReviewItem(eventId, "Unable to determine workflow stream.");

      return this.getEventDetail(eventId);
    }

    const adapter = getAdapterForStream(stream);

    if (!adapter || !adapter.supportsEventType(event.event_type)) {
      await this.db.event.update({
        where: { id: eventId },
        data: {
          status: "review_required",
          reviewRequired: true,
          lastError: null
        }
      });
      await logAudit(
        this.db,
        eventId,
        options?.isReprocess
          ? "Corrected payload still has an unsupported event type."
          : "Unsupported event type routed to review.",
        {
          stream,
          event_type: event.event_type
        }
      );
      await this.ensureOpenReviewItem(
        eventId,
        `Unsupported event type for ${stream}: ${event.event_type}.`
      );

      return this.getEventDetail(eventId);
    }

    await this.db.event.update({
      where: { id: eventId },
      data: { status: "processing", reviewRequired: false, lastError: null }
    });
    await logAudit(this.db, eventId, "Workflow processing started.", {
      stream,
      reprocess: options?.isReprocess === true
    });

    const decision = adapter.buildActions(event);

    if (decision.outcome === "review") {
      await this.db.event.update({
        where: { id: eventId },
        data: {
          status: "review_required",
          reviewRequired: true,
          lastError: null
        }
      });
      await logAudit(this.db, eventId, "Adapter requested human review.", {
        reason: decision.reason,
        reprocess: options?.isReprocess === true
      });
      await this.ensureOpenReviewItem(eventId, decision.reason);

      return this.getEventDetail(eventId);
    }

    if (options?.isReprocess) {
      const supersededCount = await this.supersedeActiveActions(eventId);
      await logAudit(this.db, eventId, "Previous actions superseded before reprocessing.", {
        supersededCount
      });
    }

    const actionRecords = await Promise.all(
      decision.actions.map((action) =>
        this.db.action.create({
          data: {
            eventId,
            type: action.type,
            service: action.service,
            payload: toJson(action.payload),
            status: "pending"
          }
        })
      )
    );

    await logAudit(this.db, eventId, "Actions generated.", {
      actionCount: actionRecords.length,
      reprocess: options?.isReprocess === true
    });

    let hasFailure = false;

    for (let index = 0; index < actionRecords.length; index += 1) {
      const actionRecord = actionRecords[index];
      const action = decision.actions[index];
      let execution;

      try {
        execution = await adapter.executeAction(action, event);
      } catch (error) {
        const message = getFailureMessage(
          error,
          `Mock external service failure while executing ${action.type}.`
        );

        execution = {
          success: false,
          message,
          metadata: {
            actionType: action.type,
            service: action.service,
            failureKind: "thrown_error"
          }
        };
      }

      await this.db.action.update({
        where: { id: actionRecord.id },
        data: { status: execution.success ? "executed" : "failed" }
      });

      await logAudit(this.db, eventId, execution.message, {
        success: execution.success,
        actionType: action.type,
        ...execution.metadata
      });

      if (!execution.success) {
        hasFailure = true;
      }
    }

    if (hasFailure) {
      await this.db.event.update({
        where: { id: eventId },
        data: {
          status: "failed",
          reviewRequired: true,
          lastError: "One or more mock external actions failed."
        }
      });
      await logAudit(this.db, eventId, "Event failed and moved to review.", {
        reason: "Mock external service failure.",
        reprocess: options?.isReprocess === true
      });
      await this.ensureOpenReviewItem(eventId, "Mock external service failure.");
    } else {
      await this.db.event.update({
        where: { id: eventId },
        data: { status: "completed", reviewRequired: false, lastError: null }
      });
      await logAudit(this.db, eventId, "Event completed successfully.", {
        reprocess: options?.isReprocess === true
      });
    }

    return this.getEventDetail(eventId);
  }

  private async ensureOpenReviewItem(eventId: string, reason: string) {
    const existing = await this.db.reviewQueueItem.findFirst({
      where: { eventId, status: "open" },
      orderBy: { createdAt: "desc" }
    });

    if (existing) {
      return this.db.reviewQueueItem.update({
        where: { id: existing.id },
        data: { reason }
      });
    }

    return this.db.reviewQueueItem.create({
      data: {
        eventId,
        reason,
        status: "open"
      }
    });
  }

  private async getReviewQueueItem(id: string) {
    return this.db.reviewQueueItem.findUnique({
      where: { id },
      include: {
        event: {
          include: {
            actions: { orderBy: { createdAt: "asc" } },
            auditLogs: { orderBy: { createdAt: "asc" } }
          }
        }
      }
    });
  }

  private async supersedeActiveActions(eventId: string) {
    const result = await this.db.action.updateMany({
      where: {
        eventId,
        status: {
          not: "superseded"
        }
      },
      data: {
        status: "superseded"
      }
    });

    return result.count;
  }
}

export const workflowEngine = new WorkflowEngine();
