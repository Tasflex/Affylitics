import Link from "next/link";
import { adminGet, qs, when } from "@/lib/admin";

type A = { id: number; actor_id: string | null; actor_email: string | null; action: string; target: string | null; meta: Record<string, unknown>; created_at: string };

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ q?: string; offset?: string }> }) {
  const sp = await searchParams;
  const offset = Number(sp.offset ?? 0);
  const rows = await adminGet<A[]>(`/audit${qs({ q: sp.q, offset: String(offset), limit: "100" })}`);
  return (
    <>
      <h1 style={{ fontSize: "2.2rem" }}>Audit log</h1>
      <p className="muted">Every sign-in, money movement and staff action. Entries can&apos;t be edited.</p>
      <form className="row" role="search" style={{ marginBottom: 20 }}>
        <label className="sr-only" htmlFor="q">Filter</label>
        <input id="q" name="q" className="input" defaultValue={sp.q} placeholder="Action prefix (e.g. admin.), email or target ID" style={{ flex: 1, minWidth: 200 }} />
        <button className="btn" type="submit">Filter</button>
      </form>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Audit log</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Details</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td style={{ whiteSpace: "nowrap" }}>{when(a.created_at)}</td>
                <td>{a.actor_id ? <Link href={`/admin/users/${a.actor_id}`}>{a.actor_email ?? a.actor_id}</Link> : "system"}</td>
                <td><span className="code">{a.action}</span></td>
                <td className="muted" style={{ fontSize: ".85rem", wordBreak: "break-word" }}>{a.target && <>target {a.target} · </>}{JSON.stringify(a.meta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        {offset > 0 && <Link className="btn ghost small" href={`/admin/audit${qs({ q: sp.q, offset: String(Math.max(0, offset - 100)) })}`}>← Newer</Link>}
        {rows.length === 100 && <Link className="btn ghost small" href={`/admin/audit${qs({ q: sp.q, offset: String(offset + 100) })}`}>Older →</Link>}
      </div>
    </>
  );
}
