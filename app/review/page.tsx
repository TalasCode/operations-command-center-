"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ActionList } from "@/components/ActionList";
import { AuditTimeline } from "@/components/AuditTimeline";
import { JsonViewer } from "@/components/JsonViewer";
import { StatusBadge } from "@/components/StatusBadge";

type ReviewQueueItem = {
  id: string;
  reason: string;
  status: string;
  resolutionNotes: string | null;
  createdAt: string;
  event: {
    id: string;
    sourceEventId: string;
    source: string;
    eventType: string;
    detectedStream: string;
    payload: unknown;
    status: string;
    reviewRequired: boolean;
    actions: Array<{
      id: string;
      type: string;
      service: string;
      status: string;
      payload: Record<string, unknown>;
    }>;
    auditLogs: Array<{
      id: string;
      message: string;
      metadata?: unknown;
      createdAt: string;
    }>;
  };
};

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [actionsDraft, setActionsDraft] = useState("");
  const [payloadDraft, setPayloadDraft] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  const loadItems = async () => {
    const response = await fetch("/api/events?view=review-queue");
    const json = (await response.json()) as { items: ReviewQueueItem[] };
    setItems(json.items);

    if (json.items.length > 0) {
      const activeId = json.items.some((item) => item.id === selectedId)
        ? selectedId
        : json.items[0].id;
      setSelectedId(activeId);
    } else {
      setSelectedId("");
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  useEffect(() => {
    if (!selectedItem) {
      setNotes("");
      setActionsDraft("");
      setPayloadDraft("");
      return;
    }

    setNotes(selectedItem.resolutionNotes ?? "");
    setActionsDraft(JSON.stringify(selectedItem.event.actions, null, 2));
    setPayloadDraft(JSON.stringify(selectedItem.event.payload, null, 2));
  }, [selectedId, selectedItem]);

  const parseEditedActions = () => {
    try {
      const parsed = JSON.parse(actionsDraft) as ReviewQueueItem["event"]["actions"];
      if (!Array.isArray(parsed)) {
        throw new Error("Actions draft must be an array.");
      }
      setError("");
      return parsed;
    } catch {
      setError("Edited actions must be valid JSON array syntax.");
      return null;
    }
  };

  const parseEditedPayload = () => {
    try {
      const parsed = JSON.parse(payloadDraft) as ReviewQueueItem["event"]["payload"];
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Payload draft must be a JSON object.");
      }
      setError("");
      return parsed as Record<string, unknown>;
    } catch {
      setError("Edited payload must be valid JSON object syntax.");
      return null;
    }
  };

  const submitReviewAction = async (
    action: "approve" | "reject" | "resolve" | "reprocess"
  ) => {
    if (!selectedItem) {
      return;
    }

    const editedActions = action === "approve" ? parseEditedActions() : undefined;
    const correctedPayload = action === "reprocess" ? parseEditedPayload() : null;

    if (action === "approve" && editedActions === null) {
      return;
    }

    if (action === "reprocess" && correctedPayload === null) {
      return;
    }

    const response = await fetch(`/api/review/${selectedItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        resolutionNotes: notes,
        editedActions,
        correctedPayload
      })
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Review update failed.");
      return;
    }

    setMessage(`Review action "${action}" completed.`);
    setError("");
    await loadItems();
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1 className="page-title">Human Review Queue</h1>
          <p className="page-subtitle">
            Correct payloads, approve edited actions, reject events, or resolve cases with notes.
          </p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => void loadItems()}>
          Refresh Queue
        </button>
      </header>

      <div className="review-layout">
        <div className="panel">
          <div className="review-list">
            {items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`review-item ${selectedItem?.id === item.id ? "review-item-active" : ""}`}
                  style={{ textAlign: "left", cursor: "pointer" }}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className="page-header" style={{ alignItems: "center" }}>
                    <strong>{item.event.sourceEventId}</strong>
                    <StatusBadge status={item.event.status} />
                  </div>
                  <p className="page-subtitle">{item.reason}</p>
                  <div className="meta-row">
                    <span>{item.event.detectedStream}</span>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="muted">No open review items.</p>
            )}
          </div>
        </div>

        <div className="page-stack">
          {selectedItem ? (
            <>
              <div className="panel">
                <div className="page-header">
                  <div>
                    <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                      Reviewing {selectedItem.event.sourceEventId}
                    </h2>
                    <p className="page-subtitle">{selectedItem.reason}</p>
                  </div>
                  <Link
                    href={`/events/${selectedItem.event.id}` as Route}
                    className="button button-secondary"
                  >
                    Open Event Detail
                  </Link>
                </div>

                <div className="detail-grid" style={{ marginTop: "1rem" }}>
                  <dl className="detail-item">
                    <dt>Stream</dt>
                    <dd>{selectedItem.event.detectedStream}</dd>
                  </dl>
                  <dl className="detail-item">
                    <dt>Event Type</dt>
                    <dd>{selectedItem.event.eventType}</dd>
                  </dl>
                  <dl className="detail-item">
                    <dt>Status</dt>
                    <dd>
                      <StatusBadge status={selectedItem.event.status} />
                    </dd>
                  </dl>
                </div>
              </div>

              <div className="split-grid">
                <div className="panel">
                  <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                    Original Event
                  </h2>
                  <JsonViewer value={selectedItem.event.payload} />
                </div>
                <div className="panel">
                  <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                    Current Actions
                  </h2>
                  <ActionList actions={selectedItem.event.actions} />
                </div>
              </div>

              <div className="panel">
                <div className="field">
                  <label htmlFor="edited-payload">Edit event payload before reprocessing</label>
                  <textarea
                    id="edited-payload"
                    className="textarea"
                    value={payloadDraft}
                    onChange={(event) => setPayloadDraft(event.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="edited-actions">Edit actions before approval</label>
                  <textarea
                    id="edited-actions"
                    className="textarea"
                    value={actionsDraft}
                    onChange={(event) => setActionsDraft(event.target.value)}
                  />
                </div>

                <div className="field" style={{ marginTop: "1rem" }}>
                  <label htmlFor="resolution-notes">Resolution notes</label>
                  <textarea
                    id="resolution-notes"
                    className="textarea"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    style={{ minHeight: "140px" }}
                  />
                </div>

                <div className="button-row" style={{ marginTop: "1rem" }}>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => void submitReviewAction("reprocess")}
                  >
                    Save Corrections &amp; Reprocess
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void submitReviewAction("approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="button button-warning"
                    onClick={() => void submitReviewAction("resolve")}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => void submitReviewAction("reject")}
                  >
                    Reject
                  </button>
                </div>

                {message ? <p className="success-text">{message}</p> : null}
                {error ? <p className="error-text">{error}</p> : null}
              </div>

              <div className="panel">
                <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
                  Audit Timeline
                </h2>
                <AuditTimeline logs={selectedItem.event.auditLogs} />
              </div>
            </>
          ) : (
            <div className="panel">
              <p className="muted">The review queue is empty.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
