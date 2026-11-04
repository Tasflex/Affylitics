import Link from "next/link";
import { AdminAction } from "@/components/admin/AdminAction";
import { adminGet, qs } from "@/lib/admin";
import { formatUsd } from "@/lib/site";

type B = { id: string; name: string; owner_id: string; owner_email: string; escrow_cents: number; verified: boolean };

export default async function AdminEscrow({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const brands = sp.q ? await adminGet<B[]>(`/brands${qs({ q: sp.q })}`) : [];
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Credit escrow manually</h1>
      <div className="alert info" role="note">
        Use this when a brand pays by bank transfer or another route outside the checkout. Only credit money you can see has
        <strong> arrived in the company account</strong>. Each bank reference can be credited only once, so a double click or a repeat
        can&apos;t add the money twice.
      </div>
      <form className="row" role="search" style={{ margin: "16px 0 20px" }}>
        <label className="sr-only" htmlFor="q">Find the brand</label>
        <input id="q" name="q" className="input" defaultValue={sp.q} placeholder="Brand name or owner email" style={{ flex: 1, minWidth: 200 }} />
        <button className="btn" type="submit">Find brand</button>
      </form>
      {sp.q && brands.length === 0 && <p className="muted">No brand matches “{sp.q}”.</p>}
      {brands.map((b) => (
        <section key={b.id} className="card spread" style={{ marginBottom: 12, alignItems: "flex-start" }}>
          <div>
            <strong>{b.name}</strong> {b.verified ? <span className="pill green">verified</span> : <span className="pill orange">unverified</span>}
            <div className="muted"><Link href={`/admin/users/${b.owner_id}`}>{b.owner_email}</Link> · escrow {formatUsd(b.escrow_cents)}</div>
          </div>
          <AdminAction endpoint="/api/admin/escrow/credit" label="Credit escrow" fixed={{ user_id: b.owner_id }} reason={false}
            fields={[
              { name: "amount_cents", label: "Amount received (US$)", type: "dollars" },
              { name: "reference", label: "Bank / payment reference", placeholder: "e.g. FT26308XYZ" },
            ]} />
        </section>
      ))}
    </>
  );
}
