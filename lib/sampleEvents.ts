import type { EventEnvelope } from "@/workflow/types";

export const sampleEvents: Array<{
  label: string;
  preserveSourceEventId?: boolean;
  event: EventEnvelope;
}> = [
  {
    label: "Valid FinanceOps Event",
    event: {
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
    }
  },
  {
    label: "Valid CampaignOps Event",
    event: {
      source_event_id: "campaign-001",
      source: "campaignops",
      event_type: "client_brief.received",
      payload: {
        client: "Luna Cafe",
        campaign_goal: "Launch Ramadan catering offer",
        channels: ["instagram", "email", "landing_page"],
        deadline: "2026-06-10"
      }
    }
  },
  {
    label: "Valid GuestOps Event",
    event: {
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
    }
  },
  {
    label: "Ambiguous Event",
    event: {
      source_event_id: "unknown-001",
      source: "unknown",
      event_type: "message.received",
      payload: {
        text: "Please move this to next Friday and tell the client it is confirmed."
      }
    }
  },
  {
    label: "Missing Required Field",
    event: {
      source_event_id: "finance-002",
      source: "financeops",
      event_type: "invoice.overdue",
      payload: {
        customer_name: "Acme Trading",
        amount: 4200,
        currency: "USD",
        days_overdue: 17
      }
    }
  },
  {
    label: "Simulated Failure Event",
    event: {
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
    }
  },
  {
    label: "Duplicate FinanceOps Event (submit after finance-001)",
    preserveSourceEventId: true,
    event: {
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
    }
  }
];
