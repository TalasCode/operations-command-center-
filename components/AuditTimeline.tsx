type AuditTimelineProps = {
  logs: Array<{
    id: string;
    message: string;
    metadata?: unknown;
    createdAt: string;
  }>;
};

export function AuditTimeline({ logs }: AuditTimelineProps) {
  if (logs.length === 0) {
    return <p className="muted">No audit entries yet.</p>;
  }

  return (
    <div className="timeline-list">
      {logs.map((log) => (
        <div key={log.id} className="timeline-item">
          <strong>{log.message}</strong>
          <div className="meta-row">
            <span>{new Date(log.createdAt).toLocaleString()}</span>
          </div>
          {log.metadata ? (
            <pre className="json-viewer" style={{ marginTop: "0.8rem" }}>
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}
