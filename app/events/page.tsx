"use client";

import { useEffect, useState } from "react";

import { EventTable } from "@/components/EventTable";

type EventItem = {
  id: string;
  sourceEventId: string;
  detectedStream: string;
  eventType: string;
  status: string;
  reviewRequired: boolean;
  createdAt: string;
  reviewReason?: string | null;
};

export default function EventsPage() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [search, setSearch] = useState("");
  const [stream, setStream] = useState("all");
  const [status, setStatus] = useState("all");
  const [review, setReview] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) {
      params.set("search", search);
    }
    if (stream !== "all") {
      params.set("stream", stream);
    }
    if (status !== "all") {
      params.set("status", status);
    }
    if (review !== "all") {
      params.set("review", review);
    }

    const run = async () => {
      const response = await fetch(`/api/events?${params.toString()}`);
      const json = (await response.json()) as { items: EventItem[] };
      setItems(json.items);
    };

    void run();
  }, [review, search, status, stream]);

  return (
    <section className="page-stack">
      <header>
        <h1 className="page-title">Event Inbox</h1>
        <p className="page-subtitle">
          Filter by stream, status, and review requirement to inspect persisted events.
        </p>
      </header>

      <div className="panel">
        <div className="filters">
          <div className="field">
            <label htmlFor="search">Search</label>
            <input
              id="search"
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="finance-001, invoice.overdue..."
            />
          </div>
          <div className="field">
            <label htmlFor="stream">Stream</label>
            <select
              id="stream"
              className="select"
              value={stream}
              onChange={(event) => setStream(event.target.value)}
            >
              <option value="all">All streams</option>
              <option value="financeops">FinanceOps</option>
              <option value="campaignops">CampaignOps</option>
              <option value="guestops">GuestOps</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select
              id="status"
              className="select"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="received">received</option>
              <option value="processing">processing</option>
              <option value="completed">completed</option>
              <option value="review_required">review_required</option>
              <option value="failed">failed</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="review">Review required</label>
            <select
              id="review"
              className="select"
              value={review}
              onChange={(event) => setReview(event.target.value)}
            >
              <option value="all">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <EventTable events={items} />
      </div>
    </section>
  );
}
