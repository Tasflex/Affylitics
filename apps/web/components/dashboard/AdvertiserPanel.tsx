"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { api } from "@/lib/client";
import { formatUsd, payoutLabel } from "@/lib/site";

type Brand = { id: string; name: string; website: string; verified: boolean };
type MyOffer = { id: string; slug: string; title: string; status: string; model: string; payout_cents: number | null; payout_bps: number | null; clicks: number; conversions: number };
type Conversion = { id: string; offer_title: string; external_ref: string; commission_cents: number; status: string; created_at: string };

export function AdvertiserPanel() {
  const id = useId();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [offers, setOffers] = useState<MyOffer[]>([]);
  const [escrow, setEscrow] = useState(0);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [secret, setSecret] = useState<{ brand: string; value: string } | null>(null);
  const [model, setModel] = useState("cps");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [b, o, c] = await Promise.all([
      api<Brand[]>("/api/brands"),
      api<{ offers: MyOffer[]; escrow_cents: number }>("/api/advertiser/offers"),
      api<Conversion[]>("/api/advertiser/conversions"),
    ]);
    setBrands(b);
    setOffers(o.offers);
    setEscrow(o.escrow_cents);
    setConversions(c);
  }, []);
  useEffect(() => void load().catch((e) => setMsg({ kind: "error", text: e.message })), [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function createBrand(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    void run(async () => {
      const res = await api<{ id: string; postback_secret: string }>("/api/brands", { name: f.get("name"), website: f.get("website") });
      setSecret({ brand: res.id, value: res.postback_secret });
      form.reset();
    });
  }

  function createOffer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    const countries = String(f.get("countries") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    void run(async () => {
      await api("/api/offers", {
        brand_id: f.get("brand_id"),
        title: f.get("title"),
        description: f.get("description"),
        category: f.get("category"),
        landing_url: f.get("landing_url"),
        model,
        payout_cents: model === "cps" ? null : Math.round(Number(f.get("payout")) * 100),
        payout_bps: model === "cps" ? Math.round(Number(f.get("payout")) * 100) : null,
        hold_days: Number(f.get("hold_days")),
        cookie_days: Number(f.get("cookie_days")),
        allowed_countries: countries.length ? countries : null,
      });
      form.reset();
      setMsg({ kind: "success", text: "Offer saved as a draft. Fund your escrow, then set it live." });
    });
  }

  function fund(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = Math.round(Number(new FormData(e.currentTarget).get("amount")) * 100);
    void run(async () => {
      const res = await api<{ url: string }>("/api/escrow/fund", { amount_cents: amount });
      window.location.assign(res.url);
    });
  }

  return (
    <div className="stack">
      <div aria-live="polite">{msg && <div className={`alert ${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</div>}</div>

      <div className="grid cols-2">
        <section className="card" aria-labelledby={`${id}-esc`}>
          <h2 id={`${id}-esc`} style={{ fontSize: "1.4rem" }}>Escrow</h2>
          <p className="stat value" style={{ padding: 0, fontFamily: "var(--font-display)", fontSize: "2.2rem", color: "var(--heading)", margin: "0 0 12px" }}>{formatUsd(escrow)}</p>
          <form onSubmit={fund} className="row">
            <label htmlFor={`${id}-fund`} className="sr-only">Top-up amount in US dollars</label>
            <input id={`${id}-fund`} name="amount" type="number" min="10" max="10000" step="1" defaultValue={100} className="input" style={{ maxWidth: 160 }} required />
            <button type="submit" className="btn" disabled={busy}>Add funds</button>
          </form>
          <p className="hint muted" style={{ marginTop: 8 }}>Card, mobile money or bank. Offers pause automatically if escrow runs out.</p>
        </section>

        <section className="card" aria-labelledby={`${id}-brand`}>
          <h2 id={`${id}-brand`} style={{ fontSize: "1.4rem" }}>Brands</h2>
          {brands.length > 0 && <ul>{brands.map((b) => <li key={b.id}>{b.name} <span className="muted">({b.website})</span> <span className="code">{b.id}</span></li>)}</ul>}
          <form onSubmit={createBrand}>
            <div className="field"><label htmlFor={`${id}-bn`}>Brand name</label><input id={`${id}-bn`} name="name" className="input" required maxLength={120} /></div>
            <div className="field"><label htmlFor={`${id}-bw`}>Website</label><input id={`${id}-bw`} name="website" type="url" placeholder="https://" className="input" required /></div>
            <button type="submit" className="btn secondary" disabled={busy}>Add brand</button>
          </form>
        </section>
      </div>

      {secret && (
        <div className="alert success" role="status">
          <strong>Postback secret for brand <span className="code">{secret.brand}</span>.</strong> Copy it now; we will not show it again.
          <div className="code" style={{ marginTop: 8 }}>{secret.value}</div>
        </div>
      )}

      {brands.length > 0 && (
        <section className="card" aria-labelledby={`${id}-new`}>
          <h2 id={`${id}-new`} style={{ fontSize: "1.4rem" }}>New offer</h2>
          <form onSubmit={createOffer} className="grid cols-2" style={{ gap: "0 20px" }}>
            <div className="field"><label htmlFor={`${id}-ob`}>Brand</label>
              <select id={`${id}-ob`} name="brand_id" className="input">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div className="field"><label htmlFor={`${id}-ot`}>Offer title</label><input id={`${id}-ot`} name="title" className="input" required minLength={3} maxLength={140} /></div>
            <div className="field"><label htmlFor={`${id}-oc`}>Category</label><input id={`${id}-oc`} name="category" className="input" required placeholder="e.g. solar, software, fashion" /></div>
            <div className="field"><label htmlFor={`${id}-ol`}>Landing page</label><input id={`${id}-ol`} name="landing_url" type="url" className="input" required placeholder="https://" /></div>
            <div className="field"><label htmlFor={`${id}-om`}>Commission type</label>
              <select id={`${id}-om`} className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="cps">Percentage of each sale</option><option value="cpa">Fixed amount per sale</option><option value="cpl">Fixed amount per lead</option>
              </select></div>
            <div className="field"><label htmlFor={`${id}-op`}>{model === "cps" ? "Commission (%)" : "Commission (US$)"}</label>
              <input id={`${id}-op`} name="payout" type="number" step="0.01" min="0.01" className="input" required /></div>
            <div className="field"><label htmlFor={`${id}-oh`}>Hold period (days)</label><input id={`${id}-oh`} name="hold_days" type="number" min="0" max="120" defaultValue={30} className="input" /></div>
            <div className="field"><label htmlFor={`${id}-ok`}>Cookie window (days)</label><input id={`${id}-ok`} name="cookie_days" type="number" min="1" max="120" defaultValue={30} className="input" /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor={`${id}-oco`}>Buyer countries (optional)</label>
              <input id={`${id}-oco`} name="countries" className="input" placeholder="KE, NG, GH — leave empty for anywhere" aria-describedby={`${id}-oco-h`} />
              <span className="hint" id={`${id}-oco-h`}>Where your customers must be. Publishers can be anywhere.</span>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor={`${id}-od`}>Description for publishers</label><textarea id={`${id}-od`} name="description" rows={4} className="input" maxLength={5000} /></div>
            <div><button type="submit" className="btn" disabled={busy}>Save draft offer</button></div>
          </form>
        </section>
      )}

      <section aria-labelledby={`${id}-offers`}>
        <h2 id={`${id}-offers`} style={{ fontSize: "1.4rem" }}>Your offers</h2>
        {offers.length === 0 ? <p className="muted">No offers yet.</p> : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Your offers</caption>
              <thead><tr><th scope="col">Offer</th><th scope="col">Commission</th><th scope="col" className="num">Clicks</th><th scope="col" className="num">Conversions</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <th scope="row">{o.title}</th>
                    <td>{payoutLabel(o)}</td>
                    <td className="num">{o.clicks}</td>
                    <td className="num">{o.conversions}</td>
                    <td>
                      <label className="sr-only" htmlFor={`st-${o.id}`}>Status of {o.title}</label>
                      <select id={`st-${o.id}`} className="input" style={{ minHeight: 36 }} value={o.status} disabled={busy}
                        onChange={(e) => run(() => api(`/api/offers/${o.id}/status`, { status: e.target.value }))}>
                        {o.status === "draft" && <option value="draft" disabled>Draft</option>}
                        <option value="active">Live</option><option value="paused">Paused</option><option value="archived">Archived</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby={`${id}-conv`}>
        <h2 id={`${id}-conv`} style={{ fontSize: "1.4rem" }}>Conversions</h2>
        {conversions.length === 0 ? <p className="muted">Conversions you send by postback appear here.</p> : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Conversions</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Offer</th><th scope="col">Your ref</th><th scope="col" className="num">Commission</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {conversions.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td>{c.offer_title}</td>
                    <td><span className="code">{c.external_ref}</span></td>
                    <td className="num">{formatUsd(c.commission_cents)}</td>
                    <td>
                      {c.status === "pending" ? (
                        <button type="button" className="btn ghost small" disabled={busy}
                          onClick={() => {
                            const reason = window.prompt("Why is this conversion being rejected? The publisher will see this.");
                            if (reason) void run(() => api(`/api/advertiser/conversions/${c.id}/reject`, { reason }));
                          }}>
                          Reject
                        </button>
                      ) : c.status}
                    </td>
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
