import Link from "next/link";
import { AdminAction } from "@/components/admin/AdminAction";
import { adminGet, when } from "@/lib/admin";
import { countryName } from "@/lib/rails";
import { formatUsd } from "@/lib/site";

type Detail = {
  user: { id: string; email: string; display_name: string; role: string | null; country: string | null; kyc_tier: number; status: string; email_verified: boolean; is_admin: boolean; onboarded: boolean; created_at: string };
  profile: Record<string, unknown>;
  suspended_reason: string | null;
  balances: { escrow_cents: number; pending_cents: number; available_cents: number; in_payout_cents: number };
  sites: { url: string; verified_at: string | null }[];
  sign_in: string[];
  brands: { id: string; name: string; website: string; verified: boolean }[];
  kyc: { provider: string; tier: number; status: string; reason: string | null; created_at: string }[];
  audit: { action: string; target: string | null; meta: Record<string, unknown>; created_at: string }[];
};

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await adminGet<Detail>(`/users/${id}`);
  const u = d.user;
  const profile = Object.entries(d.profile).filter(([, v]) => (Array.isArray(v) ? v.length : v));
  return (
    <>
      <p><Link href="/admin/users">← Users</Link></p>
      <div className="spread">
        <h1 style={{ fontSize: "2.2rem", margin: 0 }}>{u.display_name}</h1>
        {u.status === "active" ? <span className="pill green">Active</span> : <span className="pill warn">Suspended</span>}
      </div>
      <p className="muted">
        {u.email} {u.email_verified ? "(verified)" : "(unverified)"} · {u.role === "advertiser" ? "Brand" : u.role === "publisher" ? "Affiliate" : "No role yet"} ·{" "}
        {u.country ? countryName(u.country) : "no country"} · KYC level {u.kyc_tier} · joined {when(u.created_at)}{d.sign_in.length > 0 && <> · linked: {d.sign_in.join(", ")}</>}
      </p>
      {d.suspended_reason && <div className="alert error" role="note">Suspended: {d.suspended_reason}</div>}

      <div className="row" style={{ margin: "16px 0 28px", alignItems: "flex-start" }}>
        {u.status === "active"
          ? <AdminAction endpoint={`/api/admin/users/${u.id}/status`} label="Suspend" fixed={{ status: "suspended" }} danger />
          : <AdminAction endpoint={`/api/admin/users/${u.id}/status`} label="Reactivate" fixed={{ status: "active" }} />}
        <AdminAction endpoint={`/api/admin/users/${u.id}/kyc`} label="Set KYC level" fields={[{ name: "tier", label: "Level", type: "select", asNumber: true, options: [0, 1, 2, 3].map((t) => ({ value: String(t), label: `Level ${t}` })) }]} />
      </div>

      <div className="grid cols-4" style={{ marginBottom: 24 }}>
        {u.role === "advertiser"
          ? <div className="card stat"><div className="label">Escrow</div><div className="value" style={{ fontSize: "1.5rem" }}>{formatUsd(d.balances.escrow_cents)}</div></div>
          : <>
              <div className="card stat"><div className="label">Pending</div><div className="value" style={{ fontSize: "1.5rem" }}>{formatUsd(d.balances.pending_cents)}</div></div>
              <div className="card stat"><div className="label">Available</div><div className="value" style={{ fontSize: "1.5rem" }}>{formatUsd(d.balances.available_cents)}</div></div>
              <div className="card stat"><div className="label">In payout</div><div className="value" style={{ fontSize: "1.5rem" }}>{formatUsd(d.balances.in_payout_cents)}</div></div>
            </>}
      </div>

      <div className="grid cols-2">
        <section className="card">
          <h2 style={{ fontSize: "1.2rem", fontFamily: "var(--font-sans)", fontWeight: 750 }}>Profile</h2>
          {profile.length === 0 ? <p className="muted">No answers yet.</p> : (
            <dl style={{ margin: 0 }}>
              {profile.map(([k, v]) => <div key={k} style={{ marginBottom: 8 }}><dt style={{ fontWeight: 700, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</dt><dd style={{ margin: 0 }} className="muted">{Array.isArray(v) ? v.join(", ") : String(v)}</dd></div>)}
            </dl>
          )}
        </section>
        <section className="card">
          <h2 style={{ fontSize: "1.2rem", fontFamily: "var(--font-sans)", fontWeight: 750 }}>Websites &amp; brands</h2>
          {d.sites.length === 0 && d.brands.length === 0 && <p className="muted">None.</p>}
          <ul style={{ paddingLeft: 18 }}>
            {d.sites.map((s) => <li key={s.url}>{s.url} {s.verified_at ? <span className="pill green">verified</span> : <span className="pill">unverified</span>}</li>)}
            {d.brands.map((b) => <li key={b.id}>Brand: {b.name} ({b.website}) {b.verified ? <span className="pill green">verified</span> : <span className="pill orange">unverified</span>}</li>)}
          </ul>
          {d.kyc.length > 0 && (
            <>
              <h3 style={{ fontSize: "1rem", marginTop: 16 }}>Identity checks</h3>
              <ul style={{ paddingLeft: 18 }}>{d.kyc.map((k, i) => <li key={i}>Level {k.tier} via {k.provider}: {k.status}{k.reason ? ` (${k.reason})` : ""} · {when(k.created_at)}</li>)}</ul>
            </>
          )}
        </section>
      </div>

      <h2 style={{ fontSize: "1.3rem", marginTop: 28 }}>Recent activity</h2>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Audit log for this user</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Action</th><th scope="col">Details</th></tr></thead>
          <tbody>
            {d.audit.map((a, i) => (
              <tr key={i}><td>{when(a.created_at)}</td><td><span className="code">{a.action}</span></td><td className="muted" style={{ fontSize: ".85rem" }}>{JSON.stringify(a.meta)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
