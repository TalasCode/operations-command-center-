"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  {
    href: "/" as Route,
    label: "Dashboard",
    copy: "Totals, failures, and recent activity"
  },
  {
    href: "/events" as Route,
    label: "Event Inbox",
    copy: "Filter received events and inspect results"
  },
  {
    href: "/simulator" as Route,
    label: "Event Simulator",
    copy: "Submit sample payloads and test failure paths"
  },
  {
    href: "/review" as Route,
    label: "Human Review Queue",
    copy: "Resolve ambiguous, invalid, and failed cases"
  }
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-kicker">Internal Ops Tool</span>
        <span className="brand-title">Command Center</span>
        <p className="brand-copy">
          Shared workflow orchestration for FinanceOps, CampaignOps, and GuestOps.
        </p>
      </div>

      <nav className="nav-list">
        {navigation.map((item) => {
          const isActive =
            item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? "nav-link-active" : ""}`}
            >
              <span className="nav-label">{item.label}</span>
              <span className="nav-copy">{item.copy}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
