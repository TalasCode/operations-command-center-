import type { GeneratedAction, ServiceExecutionResult } from "@/workflow/types";

function shouldFail(action: GeneratedAction, eventPayload: Record<string, unknown>) {
  return action.payload.simulate_failure === true || eventPayload.simulate_failure === true;
}

export async function runGuestAction(
  action: GeneratedAction,
  eventPayload: Record<string, unknown>
): Promise<ServiceExecutionResult> {
  if (shouldFail(action, eventPayload)) {
    return {
      success: false,
      message: "GuestOps mock service could not process the request.",
      metadata: { service: "mockGuestService", actionType: action.type }
    };
  }

  return {
    success: true,
    message: `GuestOps completed ${action.type}.`,
    metadata: { service: "mockGuestService", actionType: action.type }
  };
}
