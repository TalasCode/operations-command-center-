import { runCampaignAction } from "@/services/mockCampaignService";
import type { AdapterDecision, EventEnvelope, WorkflowAdapter } from "@/workflow/types";

const channelTitles: Record<string, string> = {
  instagram: "Instagram creative brief",
  email: "Email copy brief",
  landing_page: "Landing page content brief"
};

function startCase(value: string) {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const campaignAdapter: WorkflowAdapter = {
  stream: "campaignops",
  supportsEventType(eventType) {
    return eventType === "client_brief.received";
  },
  buildActions(event: EventEnvelope): AdapterDecision {
    const { client, campaign_goal, channels, deadline } = event.payload;

    if (
      typeof client !== "string" ||
      typeof campaign_goal !== "string" ||
      !Array.isArray(channels) ||
      channels.length === 0 ||
      typeof deadline !== "string"
    ) {
      return {
        outcome: "review",
        reason:
          "CampaignOps payload is missing one of: client, campaign_goal, channels, or deadline."
      };
    }

    return {
      outcome: "ready",
      actions: channels.map((channel) => {
        const channelName = String(channel);
        const titleBase = channelTitles[channelName] ?? `${startCase(channelName)} task`;

        return {
          type: "create_campaign_task",
          service: "campaignops",
          payload: {
            title: `${titleBase} for ${client}`,
            channel: channelName,
            deadline,
            simulate_failure: event.payload.simulate_failure
          }
        };
      })
    };
  },
  executeAction(action, event) {
    return runCampaignAction(action, event.payload);
  }
};
