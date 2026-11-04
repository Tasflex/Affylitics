import Link from "next/link";
import { PayoutsPanel } from "@/components/dashboard/PayoutsPanel";
import { railsFor } from "@/lib/rails";
import { requireMe } from "@/lib/session";
import { formatUsd } from "@/lib/site";

export default async function Payouts() {
  const me = await requireMe("/dashboard/payouts");
  const country = railsFor(me.country);
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Payouts</h1>
      <p className="muted">
        Available: <strong>{formatUsd(me.balances.available_cents)}</strong>. Payout methods for{" "}
        {country ? <Link href={`/payouts/${country.slug}`}>{country.name}</Link> : me.country}.
      </p>
      {me.kyc_tier === 0 && (
        <div className="alert info" role="note">
          Add your payout method now. To withdraw, first <Link href="/dashboard/kyc">verify your identity</Link>.
        </div>
      )}
      {country ? (
        <PayoutsPanel rails={country.rails} currency={country.currency} available={me.balances.available_cents} canWithdraw={me.kyc_tier >= 1} />
      ) : (
        <div className="alert error" role="alert">International sanctions law stops us from paying out to this country.</div>
      )}
    </>
  );
}
