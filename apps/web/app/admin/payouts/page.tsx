import Link from "next/link";
import { AdminAction } from "@/components/admin/AdminAction";
import { adminGet, qs, when } from "@/lib/admin";
import { countryName } from "@/lib/rails";
import { formatUsd } from "@/lib/site";

type P = { id: string; user_id: string; email: string; rail: string; country: string; provider: string; amount_cents: number; fee_cents: number; status: string; provider_ref: string | null; failure_reason: string | null; held_for_review: boolean; created_at: string; updated_at: string };

const STATUS: Record<string, string> = { requested: "Queued", processing: "Processing", paid: "Paid", failed: "Failed" };

export default async function AdminPayouts({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const rows = await adminGet<P[]>(`/payouts${qs({ status: sp.status })}`);
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Payouts</h1>
      <div className="alert info" role="note">
        Settle a payout by hand only after checking the provider&apos;s dashboard. <strong>Mark paid</strong> when the money has really been
        sent (enter the provider&apos;s reference). <strong>Mark failed</strong> refunds the full amount to the affiliate&apos;s balance; never mark
        a payout failed if the provider might still send it.
      </div>
      <nav aria-label="Filter payouts" className="row" style={{ marginBottom: 16 }}>
        {[["", "All"], ["requested", "Queued"], ["processing", "Processing"], ["paid", "Paid"], ["failed", "Failed"]].map(([v, l]) => (
          <Link key={v} href={`/admin/payouts${qs({ status: v || undefined })}`} className={`btn small ${(sp.status ?? "") === v ? "" : "ghost"}`}>{l}</Link>
        ))}
      </nav>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Payouts</caption>
          <thead><tr><th scope="col">Requested</th><th scope="col">Affiliate</th><th scope="col">Method</th><th scope="col" className="num">Amount</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{when(p.created_at)}</td>
                <td><Link href={`/admin/users/${p.user_id}`}>{p.email}</Link></td>
                <td>{p.rail} via {p.provider}<div className="hint">{countryName(p.country)}</div></td>
                <td className="num">{formatUsd(p.amount_cents)}<div className="hint">fee {formatUsd(p.fee_cents)}</div></td>
                <td>
                  <span className={`pill ${p.status === "paid" ? "green" : p.status === "failed" ? "warn" : "orange"}`}>{STATUS[p.status] ?? p.status}</span>
                  {p.held_for_review && <div className="hint">Held for compliance review</div>}
                  {p.provider_ref && <div className="hint">ref {p.provider_ref}</div>}
                  {p.failure_reason && <div className="hint">{p.failure_reason}</div>}
                  {(p.status === "requested" || p.status === "processing") && (
                    <div className="row" style={{ marginTop: 6, gap: 6 }}>
                      <AdminAction endpoint={`/api/admin/payouts/${p.id}/settle`} label="Mark paid" fixed={{ status: "paid" }}
                        fields={[{ name: "provider_ref", label: "Provider transaction reference" }]} />
                      <AdminAction endpoint={`/api/admin/payouts/${p.id}/settle`} label="Mark failed" fixed={{ status: "failed" }} danger />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No payouts here.</p>}
    </>
  );
}
