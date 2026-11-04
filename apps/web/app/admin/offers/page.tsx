import Link from "next/link";
import { AdminAction } from "@/components/admin/AdminAction";
import { adminGet, qs, when } from "@/lib/admin";
import { payoutLabel } from "@/lib/site";

type O = { id: string; slug: string; title: string; brand: string; status: string; model: string; payout_cents: number | null; payout_bps: number | null; clicks: number; conversions: number; created_at: string };

export default async function AdminOffers({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const rows = await adminGet<O[]>(`/offers${qs({ q: sp.q, status: sp.status })}`);
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Campaigns</h1>
      <p className="muted">Staff can pause or archive a campaign (misleading claims, prohibited products). Only the brand can set it live again, with funded escrow.</p>
      <form className="row" role="search" style={{ marginBottom: 20 }}>
        <label className="sr-only" htmlFor="q">Search campaigns</label>
        <input id="q" name="q" className="input" defaultValue={sp.q} placeholder="Title or brand" style={{ flex: 1, minWidth: 200 }} />
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" className="input" defaultValue={sp.status ?? "all"} style={{ width: "auto" }}>
          <option value="all">Any status</option><option value="active">Live</option><option value="draft">Draft</option><option value="paused">Paused</option><option value="archived">Archived</option>
        </select>
        <button className="btn" type="submit">Filter</button>
      </form>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Campaigns</caption>
          <thead><tr><th scope="col">Campaign</th><th scope="col">Commission</th><th scope="col" className="num">Clicks</th><th scope="col" className="num">Conv.</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <th scope="row">
                  {o.status === "active" ? <Link href={`/offers/${o.slug}`}>{o.title}</Link> : o.title}
                  <div className="muted" style={{ fontSize: ".85rem", fontWeight: 400 }}>{o.brand} · {when(o.created_at)}</div>
                </th>
                <td>{payoutLabel(o)}</td>
                <td className="num">{o.clicks}</td>
                <td className="num">{o.conversions}</td>
                <td>
                  <span className={`pill ${o.status === "active" ? "green" : ""}`}>{o.status === "active" ? "Live" : o.status}</span>
                  {(o.status === "active" || o.status === "draft") && (
                    <div style={{ marginTop: 6 }}>
                      <AdminAction endpoint={`/api/admin/offers/${o.id}/status`} label="Take down" danger
                        fields={[{ name: "status", label: "Action", type: "select", options: [{ value: "paused", label: "Pause (brand can relaunch)" }, { value: "archived", label: "Archive" }] }]} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No campaigns match.</p>}
    </>
  );
}
