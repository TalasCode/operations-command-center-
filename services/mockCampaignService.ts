import type { GeneratedAction, ServiceExecutionResult } from "@/workflow/types";

function shouldFail(action: GeneratedAction, eventPayload: Record<string, unknown>) {
  return action.payload.simulate_failure === true || eventPayload.simulate_failure === true;
}

export async function runCampaignAction(
  action: GeneratedAction,
  eventPayload: Record<string, unknown>
): Promise<ServiceExecutionResult> {
  if (shouldFail(action, eventPayload)) {
    return {
      success: false,
      message: "CampaignOps mock service failed to create the task.",
      metadata: { service: "mockCampaignService", actionType: action.type }
    };
  }

  return {
    success: true,
    message: `CampaignOps created ${action.type}.`,
    metadata: { service: "mockCampaignService", actionType: action.type }
  };
}
