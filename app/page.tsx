"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";

type DashboardData = {
  totals: {
    totalEvents: number;
    completedEvents: number;
    reviewEvents: number;
    failedEvents: number;
    openReviewItems: number;
  };
  recentActivity: Array<{
    id: string;
    eventId: string;
    sourceEventId: string;
    message: string;
    createdAt: string;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const run = async () => {
      const response = await fetch("/api/events?view=dashboard");
      const json = (await response.json()) as DashboardData;
      setData(json);
    };

    void run();
  }, []);

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Stored operational events, workflow outcomes, and recent audit activity.
          </p>
        </div>
        <Link href="/simulator" className="button button-primary">
          Submit Event
        </Link>
      </header>

      <div className="stats-grid">
        <div className="card">
          <div className="stat-value">{data?.totals.totalEvents ?? "..."}</div>
          <div className="stat-label">Total events</div>
        </div>
        <div className="card">
          <div className="stat-value">{data?.totals.completedEvents ?? "..."}</div>
          <div className="stat-label">Completed events</div>
        </div>
        <div className="card">
          <div className="stat-value">{data?.totals.reviewEvents ?? "..."}</div>
          <div className="stat-label">Events needing review</div>
        </div>
        <div className="card">
          <div className="stat-value">{data?.totals.failedEvents ?? "..."}</div>
          <div className="stat-label">Failed events</div>
        </div>
        <div className="card">
          <div className="stat-value">{data?.totals.openReviewItems ?? "..."}</div>
          <div className="stat-label">Open review items</div>
        </div>
      </div>

      <div className="panel">
        <div className="page-header">
          <div>
            <h2 className="page-title" style={{ fontSize: "1.35rem" }}>
              Recent Activity
            </h2>
            <p className="page-subtitle">Latest audit trail entries from persisted data.</p>
          </div>
          <StatusBadge status="processing" />
        </div>

        <div className="activity-list" style={{ marginTop: "1rem" }}>
          {data?.recentActivity.length ? (
            data.recentActivity.map((item) => (
              <div key={item.id} className="activity-item">
                <div className="page-header" style={{ alignItems: "center" }}>
                  <strong>{item.message}</strong>
                  <Link href={`/events/${item.eventId}` as Route}>{item.sourceEventId}</Link>
                </div>
                <div className="meta-row">
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No activity yet. Submit a sample event from the simulator.</p>
          )}
        </div>
      </div>
    </section>
  );
}
