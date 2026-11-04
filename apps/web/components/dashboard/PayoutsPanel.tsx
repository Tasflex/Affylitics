"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { fieldsFor } from "@/lib/payoutFields";
import { feeText, type Rail } from "@/lib/rails";
import { formatUsd } from "@/lib/site";

type Method = { id: string; rail: string; currency: string; details_hint: string; is_default: boolean };
type Payout = { id: string; amount_cents: number; fee_cents: number; local_currency: string | null; local_amount: string | null; status: string; rail: string; failure_reason: string | null; created_at: string };

const STATUS: Record<string, string> = { requested: "Queued", processing: "Sending", paid: "Paid", failed: "Failed, refunded to balance" };

export function PayoutsPanel({ rails, currency, available, canWithdraw }: { rails: Rail[]; currency: string; available: number; canWithdraw: boolean }) {
  const id = useId();
  const router = useRouter();
  const [methods, setMethods] = useState<Method[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [railId, setRailId] = useState(rails[0]?.id ?? "");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  const rail = useMemo(() => rails.find((r) => r.id === railId), [rails, railId]);
  const railName = (rid: string) => rails.find((r) => r.id === rid)?.name ?? rid;

  const load = useCallback(async () => {
    const [m, p] = await Promise.all([api<Method[]>("/api/payout-methods"), api<Payout[]>("/api/payouts")]);
    setMethods(m);
    setPayouts(p);
  }, []);
  useEffect(() => void load().catch((e) => setMsg({ kind: "error", text: e.message })), [load]);

  async function addMethod(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rail) return;
    const form = new FormData(e.currentTarget);
    const details = Object.fromEntries(fieldsFor(rail.id, rail.kind).map((f) => [f.key, String(form.get(f.key) ?? "").trim()]));
    setBusy(true);
    try {
      await api("/api/payout-methods", { rail: rail.id, details });
      (e.target as HTMLFormElement).reset();
      setMsg({ kind: "success", text: `${rail.name} added.` });
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const dollars = Number(form.get("amount"));
    setBusy(true);
    try {
      const res = await api<{ fee_cents: number }>("/api/payouts", {
        method_id: form.get("method_id"),
        amount_cents: Math.round(dollars * 100),
        idempotency_key: idemKey,
      });
      setMsg({ kind: "success", text: `Withdrawal of ${formatUsd(Math.round(dollars * 100))} queued (fee ${formatUsd(res.fee_cents ?? 0)}).` });
      setIdemKey(crypto.randomUUID());
      await load();
      router.refresh();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(mid: string) {
    try {
      await api(`/api/payout-methods/${mid}`, undefined, "DELETE");
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  return (
    <div className="stack">
      <div aria-live="polite">{msg && <div className={`alert ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</div>}</div>

      <div className="grid cols-2">
        <section className="card" aria-labelledby={`${id}-wd`}>
          <h2 id={`${id}-wd`} style={{ fontSize: "1.4rem" }}>Withdraw</h2>
          {methods.length === 0 ? (
            <p className="muted">Add a payout method first.</p>
          ) : (
            <form onSubmit={withdraw}>
              <div className="field">
                <label htmlFor={`${id}-m`}>Send to</label>
                <select id={`${id}-m`} name="method_id" className="input" required>
                  {methods.map((m) => <option key={m.id} value={m.id}>{railName(m.rail)} {m.details_hint}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${id}-amt`}>Amount in US dollars</label>
                <input id={`${id}-amt`} name="amount" type="number" inputMode="decimal" min="2" step="0.01" max={(available / 100).toFixed(2)} className="input" required aria-describedby={`${id}-amt-hint`} />
                <span className="hint" id={`${id}-amt-hint`}>Up to {formatUsd(available)}. Paid in {currency} at the day&apos;s rate.</span>
              </div>
              <button className="btn" type="submit" disabled={busy || !canWithdraw || available <= 0}>Withdraw</button>
              {!canWithdraw && <p className="hint" style={{ marginTop: 8 }}>Verification is needed before withdrawing.</p>}
            </form>
          )}
        </section>

        <section className="card" aria-labelledby={`${id}-add`}>
          <h2 id={`${id}-add`} style={{ fontSize: "1.4rem" }}>Add a payout method</h2>
          <form onSubmit={addMethod}>
            <div className="field">
              <label htmlFor={`${id}-rail`}>Method</label>
              <select id={`${id}-rail`} className="input" value={railId} onChange={(e) => setRailId(e.target.value)}>
                {rails.map((r) => <option key={r.id} value={r.id}>{r.name} (min ${r.min_usd}, {feeText(r)})</option>)}
              </select>
            </div>
            {rail && fieldsFor(rail.id, rail.kind).map((f) => (
              <div className="field" key={`${rail.id}-${f.key}`}>
                <label htmlFor={`${id}-${f.key}`}>{f.label}</label>
                <input id={`${id}-${f.key}`} name={f.key} type={f.type ?? "text"} autoComplete={f.autoComplete ?? "off"} className="input" required maxLength={200} aria-describedby={f.hint ? `${id}-${f.key}-hint` : undefined} />
                {f.hint && <span className="hint" id={`${id}-${f.key}-hint`}>{f.hint}</span>}
              </div>
            ))}
            <button className="btn secondary" type="submit" disabled={busy}>Save method</button>
          </form>
        </section>
      </div>

      {methods.length > 0 && (
        <section aria-labelledby={`${id}-saved`}>
          <h2 id={`${id}-saved`} style={{ fontSize: "1.4rem" }}>Saved methods</h2>
          <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
            {methods.map((m) => (
              <li key={m.id} className="card spread" style={{ padding: 16 }}>
                <span><strong>{railName(m.rail)}</strong> {m.details_hint} {m.is_default && <span className="pill">Default</span>}</span>
                <button type="button" className="btn ghost small" onClick={() => remove(m.id)} aria-label={`Remove ${railName(m.rail)} ${m.details_hint}`}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${id}-hist`}>
        <h2 id={`${id}-hist`} style={{ fontSize: "1.4rem" }}>History</h2>
        {payouts.length === 0 ? <p className="muted">No withdrawals yet.</p> : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Withdrawal history</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Method</th><th scope="col">Status</th><th scope="col" className="num">Amount</th><th scope="col" className="num">Received</th></tr></thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td>{railName(p.rail)}</td>
                    <td>{STATUS[p.status] ?? p.status}{p.failure_reason && <div className="muted" style={{ fontSize: ".85rem" }}>{p.failure_reason}</div>}</td>
                    <td className="num">{formatUsd(p.amount_cents)}</td>
                    <td className="num">{p.local_amount ? `${Number(p.local_amount).toLocaleString()} ${p.local_currency}` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
