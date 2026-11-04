import Link from "next/link";
import { AdminAction } from "@/components/admin/AdminAction";
import { adminGet, qs, when } from "@/lib/admin";
import { formatUsd } from "@/lib/site";

type C = { id: string; offer_title: string; brand: string; publisher_email: string; external_ref: string; commission_cents: number; fee_cents: number; status: string; reject_reason: string | null; click_fraud_score: number | null; created_at: string };

export default async function AdminConversions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const rows = await adminGet<C[]>(`/conversions${qs({ status: sp.status })}`);
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Conversions</h1>
      <p className="muted">Sorted by the fraud score of the click behind each sale (highest first). Rejecting a pending conversion returns the commission and fee to the brand&apos;s escrow, and the affiliate sees your reason.</p>
      <nav aria-label="Filter conversions" className="row" style={{ marginBottom: 16 }}>
        {[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]].map(([v, l]) => (
          <Link key={v} href={`/admin/conversions${qs({ status: v || undefined })}`} className={`btn small ${(sp.status ?? "") === v ? "" : "ghost"}`}>{l}</Link>
        ))}
      </nav>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Conversions</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Campaign</th><th scope="col">Affiliate</th><th scope="col" className="num">Commission</th><th scope="col" className="num">Fraud score</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{when(c.created_at)}</td>
                <td>{c.offer_title}<div className="hint">{c.brand} · ref {c.external_ref}</div></td>
                <td>{c.publisher_email}</td>
                <td className="num">{formatUsd(c.commission_cents)}</td>
                <td className="num">{c.click_fraud_score == null ? "—" : <span className={c.click_fraud_score >= 0.5 ? "pill warn" : ""}>{c.click_fraud_score.toFixed(2)}</span>}</td>
                <td>
                  {c.status}
                  {c.reject_reason && <div className="hint">{c.reject_reason}</div>}
                  {c.status === "pending" && <div style={{ marginTop: 6 }}><AdminAction endpoint={`/api/admin/conversions/${c.id}/reject`} label="Reject" danger /></div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No conversions yet.</p>}
    </>
  );
}
