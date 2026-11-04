import Link from "next/link";
import { redirect } from "next/navigation";
import { LinksPanel } from "@/components/dashboard/LinksPanel";
import { requireMe } from "@/lib/session";
import { formatUsd } from "@/lib/site";

export default async function Overview() {
  const me = await requireMe();
  if (me.role === "advertiser") redirect("/dashboard/advertiser");
  const b = me.balances;
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Overview</h1>
      {me.kyc_tier === 0 && (
        <div className="alert info" role="note">
          You can earn right away. Before your first withdrawal, <Link href="/dashboard/kyc">verify your identity</Link>.
        </div>
      )}
      <div className="grid cols-3" style={{ margin: "20px 0 36px" }}>
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
