"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ActionList } from "@/components/ActionList";
import { AuditTimeline } from "@/components/AuditTimeline";
import { JsonViewer } from "@/components/JsonViewer";
import { StatusBadge } from "@/components/StatusBadge";

type EventDetail = {
  id: string;
  sourceEventId: string;
  source: string;
  eventType: string;
  detectedStream: string;
  payload: unknown;
  status: string;
  reviewRequired: boolean;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  actions: Array<{
    id: string;
    type: string;
    service: string;
    status: string;
    payload: unknown;
  }>;
  reviewItems: Array<{
    id: string;
    reason: string;
    status: string;
    resolutionNotes: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  auditLogs: Array<{
    id: string;
    message: string;
    metadata?: unknown;
    createdAt: string;
  }>;
};

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<EventDetail | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!params.id) {
        return;
      }

      const response = await fetch(`/api/events/${params.id}`);
      const json = (await response.json()) as EventDetail;
      setDetail(json);
    };

    void run();
  }, [params.id]);

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1 className="page-title">Event Detail</h1>
          <p className="page-subtitle">
            Original payload, workflow selection, generated actions, review context, and audit trail.
          </p>
        </div>
        <div className="button-row">
          <Link href="/events" className="button button-secondary">
            Back to Inbox
          </Link>
          {detail?.reviewRequired ? (
            <Link href="/review" className="button button-primary">
              Open Review Queue
            </Link>
          ) : null}
        </div>
      </header>

      {detail ? (
        <>
          <div className="panel">
            <div className="detail-grid">
              <dl className="detail-item">
                <dt>Source Event ID</dt>
                <dd>{detail.sourceEventId}</dd>
              </dl>
              <dl className="detail-item">
                <dt>Detected Stream</dt>
                <dd>{detail.detectedStream}</dd>
              </dl>
              <dl className="detail-item">
                <dt>Event Type</dt>
                <dd>{detail.eventType}</dd>
              </dl>
              <dl className="detail-item">
                <dt>Status</dt>
                <dd>
                  <StatusBadge status={detail.status} />
                </dd>
              </dl>
              <dl className="detail-item">
                <dt>Review Required</dt>
                <dd>{detail.reviewRequired ? "Yes" : "No"}</dd>
              </dl>
              <dl className="detail-item">
                <dt>Created</dt>
                <dd>{new Date(detail.createdAt).toLocaleString()}</dd>
              </dl>
            </div>

            {detail.lastError ? (
              <p className="callout error-text" style={{ marginTop: "1rem" }}>
                {detail.lastError}
              </p>
            ) : null}
          </div>

          <div className="split-grid">
            <div className="panel">
              <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                Original Payload
              </h2>
              <JsonViewer value={detail.payload} />
            </div>
            <div className="panel">
              <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                Review Context
              </h2>
              {detail.reviewItems.length ? (
                <div className="review-list" style={{ marginTop: "1rem" }}>
                  {detail.reviewItems.map((item) => (
                    <div key={item.id} className="review-item">
                      <div className="page-header" style={{ alignItems: "center" }}>
                        <strong>{item.reason}</strong>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="meta-row" style={{ marginTop: "0.6rem" }}>
                        <span>Created: {new Date(item.createdAt).toLocaleString()}</span>
                        {item.resolvedAt ? (
                          <span>Resolved: {new Date(item.resolvedAt).toLocaleString()}</span>
                        ) : null}
                      </div>
                      {item.resolutionNotes ? (
                        <p className="page-subtitle">{item.resolutionNotes}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No review items for this event.</p>
              )}
            </div>
          </div>

          <div className="panel">
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Generated Actions
            </h2>
            <ActionList actions={detail.actions} />
          </div>

          <div className="panel">
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Audit Timeline
            </h2>
            <AuditTimeline logs={detail.auditLogs} />
          </div>
        </>
      ) : (
        <div className="panel">
          <p className="muted">Loading event detail...</p>
        </div>
      )}
    </section>
  );
}
