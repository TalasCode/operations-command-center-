export const supportedStreams = ["financeops", "campaignops", "guestops"] as const;

export type SupportedStream = (typeof supportedStreams)[number];
export type WorkflowStream = SupportedStream | "unknown";
export type EventStatus =
  | "received"
  | "processing"
  | "completed"
  | "review_required"
  | "failed";
export type ActionStatus = "pending" | "executed" | "failed" | "edited" | "superseded";
export type ReviewStatus = "open" | "approved" | "rejected" | "resolved";

export interface EventEnvelope {
  source_event_id: string;
  source: string;
  event_type: string;
  payload: Record<string, unknown>;
}

export interface GeneratedAction {
  id?: string;
  type: string;
  service: SupportedStream;
  payload: Record<string, unknown>;
}

export interface ServiceExecutionResult {
  success: boolean;
  message: string;
  metadata?: Record<string, unknown>;
}

export type AdapterDecision =
  | {
      outcome: "ready";
      actions: GeneratedAction[];
    }
  | {
      outcome: "review";
      reason: string;
      actions?: GeneratedAction[];
    };

export interface WorkflowAdapter {
  stream: SupportedStream;
  supportsEventType(eventType: string): boolean;
  buildActions(event: EventEnvelope): AdapterDecision;
  executeAction(
    action: GeneratedAction,
    event: EventEnvelope
  ): Promise<ServiceExecutionResult>;
}

export interface ReviewUpdateInput {
  action: "update" | "approve" | "reject" | "resolve" | "reprocess";
  resolutionNotes?: string;
  editedActions?: GeneratedAction[];
  correctedPayload?: Record<string, unknown>;
}
