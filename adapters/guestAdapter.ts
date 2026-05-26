import { runGuestAction } from "@/services/mockGuestService";
import type { AdapterDecision, EventEnvelope, WorkflowAdapter } from "@/workflow/types";

function isPresent(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export const guestAdapter: WorkflowAdapter = {
  stream: "guestops",
  supportsEventType(eventType) {
    return eventType === "reservation.change_requested";
  },
  buildActions(event: EventEnvelope): AdapterDecision {
    const { reservation_id, guest_name, requested_check_in } = event.payload;

    if (!isPresent(reservation_id) || !isPresent(guest_name) || !isPresent(requested_check_in)) {
      return {
        outcome: "review",
        reason:
          "GuestOps payload is missing reservation_id, guest_name, or requested_check_in."
      };
    }

    if (!isIsoDate(requested_check_in)) {
      return {
        outcome: "review",
        reason: "GuestOps requested_check_in is ambiguous and requires human review."
      };
    }

    return {
      outcome: "ready",
      actions: [
        {
          type: "request_reservation_change",
          service: "guestops",
          payload: {
            reservation_id,
            requested_check_in,
            simulate_failure: event.payload.simulate_failure
          }
        },
        {
          type: "generate_guest_message",
          service: "guestops",
          payload: {
            message: `Hi ${guest_name}, we received your request to change your check-in date to ${requested_check_in}.`,
            simulate_failure: event.payload.simulate_failure
          }
        }
      ]
    };
  },
  executeAction(action, event) {
    return runGuestAction(action, event.payload);
  }
};
