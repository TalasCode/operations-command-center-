import type { GeneratedAction, ServiceExecutionResult } from "@/workflow/types";

function shouldFail(action: GeneratedAction, eventPayload: Record<string, unknown>) {
  return action.payload.simulate_failure === true || eventPayload.simulate_failure === true;
}

export async function runFinanceAction(
  action: GeneratedAction,
  eventPayload: Record<string, unknown>
): Promise<ServiceExecutionResult> {
  if (shouldFail(action, eventPayload)) {
    return {
      success: false,
      message: "FinanceOps mock service rejected the action.",
      metadata: { service: "mockFinanceService", actionType: action.type }
    };
  }

  return {
    success: true,
    message: `FinanceOps handled ${action.type}.`,
    metadata: { service: "mockFinanceService", actionType: action.type }
  };
}
