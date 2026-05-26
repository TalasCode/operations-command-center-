"use client";

import { useEffect, useMemo, useState } from "react";

import { JsonViewer } from "@/components/JsonViewer";
import { StatusBadge } from "@/components/StatusBadge";

type SampleEvent = {
  label: string;
  preserveSourceEventId?: boolean;
  event: Record<string, unknown>;
};

type SubmissionResult = {
  duplicate: boolean;
  event: {
    id: string;
    status: string;
    sourceEventId: string;
    detectedStream: string;
    reviewRequired: boolean;
    actions: Array<{ id: string; type: string; status: string; payload: unknown }>;
    reviewItems: Array<{ id: string; reason: string; status: string }>;
  };
};

function setFailureFlag(value: Record<string, unknown>, enabled: boolean) {
  const payload = value.payload;

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const nextPayload = {
      ...(payload as Record<string, unknown>)
    };

    if (enabled) {
      nextPayload.simulate_failure = true;
    } else {
      delete nextPayload.simulate_failure;
    }

    return {
      ...value,
      payload: nextPayload
    };
  }

  return value;
}

function slugifySourceEventId(sourceEventId: string) {
  return sourceEventId.replace(/-\d+$/, "");
}

function createFreshSourceEventId(sourceEventId: string) {
  return `${slugifySourceEventId(sourceEventId)}-${Date.now()}`;
}

function withFreshSourceEventId(
  sample: SampleEvent | undefined,
  event: Record<string, unknown>
) {
  if (!sample || sample.preserveSourceEventId) {
    return event;
  }

  if (typeof event.source_event_id !== "string" || event.source_event_id.trim().length === 0) {
    return event;
  }

  return {
    ...event,
    source_event_id: createFreshSourceEventId(event.source_event_id)
  };
}

export default function SimulatorPage() {
  const [samples, setSamples] = useState<SampleEvent[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editorValue, setEditorValue] = useState("");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    const run = async () => {
      const response = await fetch("/api/events?view=samples");
      const json = (await response.json()) as { items: SampleEvent[] };
      setSamples(json.items);

      if (json.items.length > 0) {
        const initialEvent = withFreshSourceEventId(json.items[0], json.items[0].event);
        setEditorValue(JSON.stringify(initialEvent, null, 2));
      }
    };

    void run();
  }, []);

  const currentLabel = useMemo(
    () => samples[selectedIndex]?.label ?? "Sample event",
    [samples, selectedIndex]
  );

  const handleSampleChange = (nextIndex: number) => {
    setSelectedIndex(nextIndex);
    setSimulateFailure(false);
    const nextSample = samples[nextIndex];
    const nextEvent = nextSample?.event;
    if (nextEvent) {
      const preparedEvent = withFreshSourceEventId(nextSample, nextEvent);
      setEditorValue(JSON.stringify(preparedEvent, null, 2));
    }
  };

  const handleFailureToggle = (enabled: boolean) => {
    setSimulateFailure(enabled);

    try {
      const parsed = JSON.parse(editorValue) as Record<string, unknown>;
      const nextSample = samples[selectedIndex];
      const nextEvent = setFailureFlag(parsed, enabled);
      const preparedEvent = withFreshSourceEventId(nextSample, nextEvent);
      setEditorValue(JSON.stringify(preparedEvent, null, 2));
      setError("");
    } catch {
      setError("Fix the JSON before toggling simulated failure.");
    }
  };

  const handleSubmit = async () => {
    try {
      const parsed = JSON.parse(editorValue) as Record<string, unknown>;
      setError("");
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });
      const json = (await response.json()) as SubmissionResult;
      setResult(json);
    } catch {
      setError("The JSON editor contains invalid JSON.");
    }
  };

  return (
    <section className="page-stack">
      <header>
        <h1 className="page-title">Event Simulator</h1>
        <p className="page-subtitle">
          Submit valid, duplicate, ambiguous, and failure payloads directly through the same API route.
        </p>
      </header>

      <div className="split-grid">
        <div className="panel">
          <div className="field">
            <label htmlFor="sample">Sample payload</label>
            <select
              id="sample"
              className="select"
              value={selectedIndex}
              onChange={(event) => handleSampleChange(Number(event.target.value))}
            >
              {samples.map((sample, index) => (
                <option key={sample.label} value={index}>
                  {sample.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginTop: "1rem" }}>
            <label htmlFor="payload-editor">JSON payload</label>
            <textarea
              id="payload-editor"
              className="textarea"
              value={editorValue}
              onChange={(event) => setEditorValue(event.target.value)}
            />
          </div>

          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className={`button ${simulateFailure ? "button-warning" : "button-secondary"}`}
              onClick={() => handleFailureToggle(!simulateFailure)}
            >
              {simulateFailure ? "Disable Failure" : "Simulate Failure"}
            </button>
            <button type="button" className="button button-primary" onClick={handleSubmit}>
              Submit Event
            </button>
          </div>

          <p className="page-subtitle" style={{ marginTop: "1rem" }}>
            Selected sample: {currentLabel}
          </p>
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <div className="panel">
          <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
            Result Preview
          </h2>
          {result ? (
            <div className="page-stack" style={{ marginTop: "1rem" }}>
              <div className="detail-grid">
                <dl className="detail-item">
                  <dt>Source Event ID</dt>
                  <dd>{result.event.sourceEventId}</dd>
                </dl>
                <dl className="detail-item">
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge status={result.event.status} />
                  </dd>
                </dl>
                <dl className="detail-item">
                  <dt>Detected Stream</dt>
                  <dd>{result.event.detectedStream}</dd>
                </dl>
                <dl className="detail-item">
                  <dt>Duplicate</dt>
                  <dd>{result.duplicate ? "Yes" : "No"}</dd>
                </dl>
              </div>

              {result.duplicate ? (
                <p className="callout">
                  Duplicate submission detected. The existing event was returned and no new actions were generated.
                </p>
              ) : null}

              <div>
                <strong>Actions</strong>
                <JsonViewer value={result.event.actions} />
              </div>

              <div>
                <strong>Review Items</strong>
                <JsonViewer value={result.event.reviewItems} />
              </div>
            </div>
          ) : (
            <p className="muted">Submit a payload to preview the stored result.</p>
          )}
        </div>
      </div>
    </section>
  );
}
