import Link from "next/link";
import { AdminAction } from "@/components/admin/AdminAction";
import { adminGet, qs, when } from "@/lib/admin";
import { formatUsd } from "@/lib/site";

type B = { id: string; name: string; website: string; verified: boolean; domain_verified: boolean; owner_id: string; owner_email: string; offers: number; escrow_cents: number; created_at: string };

export default async function AdminBrands({ searchParams }: { searchParams: Promise<{ q?: string; verified?: string }> }) {
  const sp = await searchParams;
  const rows = await adminGet<B[]>(`/brands${qs({ q: sp.q, verified: sp.verified === "true" || sp.verified === "false" ? sp.verified : undefined })}`);
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Brands</h1>
      <p className="muted">Verify a brand once you&apos;re satisfied it&apos;s a real business. A verified domain means the owner proved control of the website with the meta tag.</p>
      <form className="row" role="search" style={{ marginBottom: 20 }}>
        <label className="sr-only" htmlFor="q">Search brands</label>
        <input id="q" name="q" className="input" defaultValue={sp.q} placeholder="Name, website or owner email" style={{ flex: 1, minWidth: 200 }} />
        <label className="sr-only" htmlFor="verified">Verification</label>
        <select id="verified" name="verified" className="input" defaultValue={sp.verified ?? ""} style={{ width: "auto" }}>
          <option value="">All brands</option><option value="false">Awaiting verification</option><option value="true">Verified</option>
        </select>
        <button className="btn" type="submit">Filter</button>
      </form>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Brands</caption>
          <thead><tr><th scope="col">Brand</th><th scope="col">Owner</th><th scope="col" className="num">Campaigns</th><th scope="col" className="num">Escrow</th><th scope="col">Status</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <th scope="row">
                  {b.name}
                  <div className="muted" style={{ fontSize: ".85rem", fontWeight: 400 }}>
                    <a href={b.website} target="_blank" rel="noopener noreferrer">{b.website}</a>{" "}
                    {b.domain_verified ? <span className="pill green">domain verified</span> : <span className="pill">domain unverified</span>}
                  </div>
                  <div className="hint">added {when(b.created_at)}</div>
                </th>
                <td><Link href={`/admin/users/${b.owner_id}`}>{b.owner_email}</Link></td>
                <td className="num">{b.offers}</td>
                <td className="num">{formatUsd(b.escrow_cents)}</td>
                <td>
                  {b.verified ? <span className="pill green" style={{ marginBottom: 6 }}>Verified</span> : <span className="pill orange" style={{ marginBottom: 6 }}>Unverified</span>}
                  <div style={{ marginTop: 6 }}>
                    <AdminAction endpoint={`/api/admin/brands/${b.id}/verify`} label={b.verified ? "Remove verification" : "Verify brand"} fixed={{ verified: !b.verified }} reason={false} danger={b.verified} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No brands match.</p>}
    </>
  );
}
