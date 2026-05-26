import { runFinanceAction } from "@/services/mockFinanceService";
import type { AdapterDecision, EventEnvelope, WorkflowAdapter } from "@/workflow/types";

function missingFinanceFields(payload: Record<string, unknown>) {
  const required = ["invoice_id", "customer_name", "amount", "currency", "days_overdue"];
  return required.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === "");
}

export const financeAdapter: WorkflowAdapter = {
  stream: "financeops",
  supportsEventType(eventType) {
    return eventType === "invoice.overdue";
  },
  buildActions(event: EventEnvelope): AdapterDecision {
    const missing = missingFinanceFields(event.payload);

    if (missing.length > 0) {
      return {
        outcome: "review",
        reason: `Missing required FinanceOps fields: ${missing.join(", ")}.`
      };
    }

    const priority = Number(event.payload.days_overdue) > 14 ? "high" : "normal";

    return {
      outcome: "ready",
      actions: [
        {
          type: "send_payment_reminder",
          service: "financeops",
          payload: {
            target: event.payload.customer_name,
            invoice_id: event.payload.invoice_id,
            priority,
            simulate_failure: event.payload.simulate_failure
          }
        },
        {
          type: "create_follow_up_task",
          service: "financeops",
          payload: {
            invoice_id: event.payload.invoice_id,
            priority,
            simulate_failure: event.payload.simulate_failure
          }
        }
      ]
    };
  },
  executeAction(action, event) {
    return runFinanceAction(action, event.payload);
  }
};
