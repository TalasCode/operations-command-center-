import { StatusBadge } from "@/components/StatusBadge";

type ActionListProps = {
  actions: Array<{
    id: string;
    type: string;
    service: string;
    status: string;
    payload: unknown;
  }>;
};

export function ActionList({ actions }: ActionListProps) {
  if (actions.length === 0) {
    return <p className="muted">No actions were generated for this event.</p>;
  }

  return (
    <div className="action-list">
      {actions.map((action) => (
        <div key={action.id} className="action-card">
          <div className="page-header" style={{ alignItems: "center" }}>
            <div>
              <strong>{action.type}</strong>
              <p className="page-subtitle" style={{ marginTop: "0.2rem" }}>
                Service: {action.service}
              </p>
            </div>
            <StatusBadge status={action.status} />
          </div>
          <pre className="json-viewer" style={{ marginTop: "0.8rem" }}>
            {JSON.stringify(action.payload, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
