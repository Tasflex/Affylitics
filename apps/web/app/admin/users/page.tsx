import Link from "next/link";
import { adminGet, qs, when } from "@/lib/admin";
import { countryName } from "@/lib/rails";

type U = { id: string; email: string; display_name: string; role: string | null; country: string | null; kyc_tier: number; status: string; email_verified: boolean; is_admin: boolean; onboarded: boolean; created_at: string };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; offset?: string }> }) {
  const sp = await searchParams;
  const offset = Number(sp.offset ?? 0);
  const { rows, total } = await adminGet<{ rows: U[]; total: number }>(`/users${qs({ q: sp.q, role: sp.role, status: sp.status, offset: String(offset), limit: "50" })}`);
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Users <span className="muted" style={{ fontSize: "1rem" }}>({total})</span></h1>
      <form className="row" role="search" style={{ marginBottom: 20 }}>
        <label className="sr-only" htmlFor="q">Search users</label>
        <input id="q" name="q" className="input" defaultValue={sp.q} placeholder="Email, name or ID" style={{ flex: 1, minWidth: 200 }} />
        <label className="sr-only" htmlFor="role">Role</label>
        <select id="role" name="role" className="input" defaultValue={sp.role ?? "all"} style={{ width: "auto" }}>
          <option value="all">All roles</option><option value="publisher">Affiliates</option><option value="advertiser">Brands</option>
        </select>
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" className="input" defaultValue={sp.status ?? "all"} style={{ width: "auto" }}>
          <option value="all">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </select>
        <button className="btn" type="submit">Filter</button>
      </form>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Users</caption>
          <thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Country</th><th scope="col">KYC</th><th scope="col">Status</th><th scope="col">Joined</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <th scope="row">
                  <Link href={`/admin/users/${u.id}`}>{u.display_name}</Link>
                  <div className="muted" style={{ fontSize: ".85rem", fontWeight: 400 }}>{u.email}{u.email_verified ? " ✓" : ""}{u.is_admin ? " · staff" : ""}</div>
                </th>
                <td>{u.role === "advertiser" ? "Brand" : u.role === "publisher" ? "Affiliate" : "—"}{!u.onboarded && <div className="hint">onboarding</div>}</td>
                <td>{u.country ? countryName(u.country) : "—"}</td>
                <td>Level {u.kyc_tier}</td>
                <td>{u.status === "active" ? <span className="pill green">Active</span> : <span className="pill warn">{u.status}</span>}</td>
                <td>{when(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        {offset > 0 && <Link className="btn ghost small" href={`/admin/users${qs({ ...sp, offset: String(Math.max(0, offset - 50)) })}`}>← Previous</Link>}
        {offset + 50 < total && <Link className="btn ghost small" href={`/admin/users${qs({ ...sp, offset: String(offset + 50) })}`}>Next →</Link>}
      </div>
    </>
  );
}
