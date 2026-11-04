import type { Metadata } from "next";
import Link from "next/link";
import { serverApi, type Offer } from "@/lib/api";
import { payoutLabel } from "@/lib/site";

export const metadata: Metadata = {
  title: "Affiliate offers open to publishers worldwide",
  description: "Browse escrow-funded affiliate offers you can promote from any country. See commission, hold period and cookie window before you join.",
  alternates: { canonical: "/offers" },
};

export const revalidate = 300;

type Props = { searchParams: Promise<{ q?: string; category?: string; link?: string }> };

export default async function Offers({ searchParams }: Props) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.q) qs.set("q", sp.q);
  if (sp.category) qs.set("category", sp.category);
  const { ok, data } = await serverApi<Offer[]>(`/api/offers?${qs}`, { revalidate: 300 });
  const offers = data ?? [];

  return (
    <div className="container section">
      <p className="eyebrow">Marketplace</p>
      <h1>Offers you can promote today</h1>
      <p className="lede">Every offer below is open to publishers in every country. Funded offers have money waiting in escrow.</p>

      {sp.link === "expired" && (
        <div className="alert info" role="status">That link&apos;s offer has ended. Here are offers that are live right now.</div>
      )}

      <form role="search" action="/offers" className="row" style={{ margin: "24px 0 32px" }}>
        <label htmlFor="q" className="sr-only">Search offers</label>
        <input id="q" name="q" className="input" style={{ maxWidth: 420 }} defaultValue={sp.q} placeholder="Search offers, e.g. solar, hosting, courses" />
        <button className="btn" type="submit">Search</button>
      </form>

      {!ok && <div className="alert error" role="alert">Offers could not be loaded just now. Please try again in a minute.</div>}
      {ok && offers.length === 0 && (
        <div className="card">
          <h2 style={{ fontSize: "1.4rem" }}>No offers match yet</h2>
          <p className="muted">New advertisers are joining. Create your account now and you&apos;ll be ready when they go live.</p>
          <Link href="/signup" className="btn">Join free</Link>
        </div>
      )}

      <ul className="grid cols-3" style={{ listStyle: "none", padding: 0 }}>
        {offers.map((o) => (
          <li key={o.id} className="card offer-card">
            <div className="row">
              <span className="pill">{o.category}</span>
              {o.funded ? <span className="pill green">Funded</span> : <span className="pill warn">Awaiting funds</span>}
            </div>
            <h3><Link href={`/offers/${o.slug}`}>{o.title}</Link></h3>
            <p className="muted" style={{ margin: 0 }}>by {o.brand}{o.brand_verified ? " (verified)" : ""}</p>
            <p className="payout" style={{ margin: 0 }}>{payoutLabel(o)}</p>
            <p className="muted" style={{ margin: 0, fontSize: ".9rem" }}>{o.cookie_days}-day cookie · {o.hold_days}-day hold</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
