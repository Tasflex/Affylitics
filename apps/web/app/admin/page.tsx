import Link from "next/link";
import { adminGet } from "@/lib/admin";
import { formatUsd } from "@/lib/site";

type Stats = Record<string, number>;

export default async function AdminOverview() {
  const s = await adminGet<Stats>("/stats");
  const queues = [
    { n: s.payouts_held_for_review, label: "Payouts held for compliance review", href: "/admin/payouts?status=requested" },
    { n: s.payouts_stuck, label: "Payouts stuck in processing (reconcile)", href: "/admin/payouts?status=processing" },
    { n: s.unverified_brands, label: "Brands awaiting verification", href: "/admin/brands?verified=false" },
    { n: s.kyc_open, label: "Identity checks in progress", href: "/admin/users" },
  ];
  const tiles = [
    ["Affiliates", s.publishers.toLocaleString()],
    ["Brands", s.advertisers.toLocaleString()],
    ["Sign-ups (7 days)", s.signups_7d.toLocaleString()],
    ["Live campaigns", s.active_offers.toLocaleString()],
    ["Clicks (30 days)", s.clicks_30d.toLocaleString()],
    ["Conversions (30 days)", s.conversions_30d.toLocaleString()],
    ["Commissions (30 days)", formatUsd(s.commission_30d_cents)],
    ["Platform revenue (all time)", formatUsd(s.platform_revenue_cents)],
    ["Escrow held for brands", formatUsd(s.escrow_total_cents)],
    ["Payouts queued", s.payouts_queued.toLocaleString()],
  ];
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Admin overview</h1>
      <section aria-labelledby="queues" className="card" style={{ marginBottom: 24 }}>
        <h2 id="queues" style={{ fontSize: "1.2rem", fontFamily: "var(--font-sans)", fontWeight: 750 }}>Needs attention</h2>
        <ul className="check-steps">
          {queues.map((q) => (
            <li key={q.label} data-done={q.n === 0}>
              <span className="tick" aria-hidden="true">{q.n === 0 ? "✓" : q.n}</span>
              {q.n === 0 ? <span>{q.label}: none</span> : <Link href={q.href}>{q.label}: {q.n}</Link>}
            </li>
          ))}
        </ul>
      </section>
      <div className="grid cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="card stat"><div className="label">{label}</div><div className="value" style={{ fontSize: "1.6rem" }}>{value}</div></div>
        ))}
      </div>
      {s.not_onboarded > 0 && <p className="muted" style={{ marginTop: 16 }}>{s.not_onboarded} account(s) haven&apos;t finished onboarding.</p>}
    </>
  );
}
