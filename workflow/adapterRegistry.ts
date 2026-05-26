import { campaignAdapter } from "@/adapters/campaignAdapter";
import { financeAdapter } from "@/adapters/financeAdapter";
import { guestAdapter } from "@/adapters/guestAdapter";
import type { SupportedStream, WorkflowAdapter, WorkflowStream } from "@/workflow/types";

const adapters: Record<SupportedStream, WorkflowAdapter> = {
  financeops: financeAdapter,
  campaignops: campaignAdapter,
  guestops: guestAdapter
};

export function detectStream(source: unknown): WorkflowStream {
  if (typeof source !== "string") {
    return "unknown";
  }

  const normalized = source.trim().toLowerCase();

  if (normalized in adapters) {
    return normalized as SupportedStream;
  }

  return "unknown";
}

export function getAdapterForStream(stream: WorkflowStream) {
  if (stream === "unknown") {
    return null;
  }

  return adapters[stream];
}
