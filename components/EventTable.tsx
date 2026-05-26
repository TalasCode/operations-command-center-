import type { Route } from "next";
import Link from "next/link";

import { StatusBadge } from "@/components/StatusBadge";

type EventRow = {
  id: string;
  sourceEventId: string;
  detectedStream: string;
  eventType: string;
  status: string;
  reviewRequired: boolean;
  createdAt: string;
  reviewReason?: string | null;
};

type EventTableProps = {
  events: EventRow[];
};

export function EventTable({ events }: EventTableProps) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Source Event ID</th>
            <th>Stream</th>
            <th>Event Type</th>
            <th>Status</th>
            <th>Review</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>
                <Link href={`/events/${event.id}` as Route}>
                  <strong>{event.sourceEventId}</strong>
                </Link>
              </td>
              <td>{event.detectedStream}</td>
              <td>{event.eventType}</td>
              <td>
                <StatusBadge status={event.status} />
              </td>
              <td>{event.reviewRequired ? event.reviewReason ?? "Yes" : "No"}</td>
              <td>{new Date(event.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
