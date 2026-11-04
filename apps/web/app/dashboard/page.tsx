import Link from "next/link";
import { redirect } from "next/navigation";
import { LinksPanel } from "@/components/dashboard/LinksPanel";
import { serverApi } from "@/lib/api";
import { requireMe } from "@/lib/session";
import { formatUsd } from "@/lib/site";

export default async function Overview() {
  const me = await requireMe();
  if (me.role === "advertiser") redirect("/dashboard/advertiser");
  const b = me.balances;
  const [links, methods, sites] = await Promise.all([
    serverApi<unknown[]>("/api/links", { auth: true }),
    serverApi<unknown[]>("/api/payout-methods", { auth: true }),
    serverApi<{ verified_at: string | null }[]>("/api/sites", { auth: true }),
  ]);
  const promotesOnWebsite = Array.isArray(me.profile.channels) && me.profile.channels.includes("Website or blog");
  const checklist = [
    { done: true, label: "Set up your profile", href: "/onboarding" },
    { done: (links.data?.length ?? 0) > 0, label: "Get your first affiliate link", href: "/offers" },
    { done: (methods.data?.length ?? 0) > 0, label: "Add a payout method", href: "/dashboard/payouts" },
    { done: me.kyc_tier >= 1, label: "Verify your identity", href: "/dashboard/kyc" },
    ...(promotesOnWebsite
      ? [{ done: (sites.data ?? []).some((s) => s.verified_at), label: "Verify your website", href: "/dashboard/sites" }]
      : []),
  ];
  const remaining = checklist.filter((c) => !c.done).length;

  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Welcome, {me.display_name.split(" ")[0]}</h1>

      {remaining > 0 && (
        <section className="card" aria-labelledby="gs" style={{ marginBottom: 24 }}>
          <div className="spread">
            <h2 id="gs" style={{ fontSize: "1.3rem", fontFamily: "var(--font-sans)", fontWeight: 750, margin: 0 }}>Getting started</h2>
            <span className="pill">{checklist.length - remaining} of {checklist.length} done</span>
          </div>
          <ul className="check-steps">
            {checklist.map((c) => (
              <li key={c.label} data-done={c.done}>
                <span className="tick" aria-hidden="true">{c.done ? "✓" : ""}</span>
                {c.done ? <span>{c.label}<span className="sr-only"> (done)</span></span> : <Link href={c.href}>{c.label}</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid cols-3" style={{ margin: "0 0 36px" }}>
        <div className="card stat">
          <div className="label">Available to withdraw</div>
          <div className="value">{formatUsd(b.available_cents)}</div>
          <Link href="/dashboard/payouts">Withdraw</Link>
        </div>
        <div className="card stat">
          <div className="label">Pending (in hold period)</div>
          <div className="value">{formatUsd(b.pending_cents)}</div>
        </div>
        <div className="card stat">
          <div className="label">Being paid out</div>
          <div className="value">{formatUsd(b.in_payout_cents)}</div>
        </div>
      </div>
      <LinksPanel />
    </>
  );
}
