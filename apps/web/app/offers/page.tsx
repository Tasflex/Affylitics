import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icons";
import { EXAMPLE_OFFERS, OfferCard } from "@/components/OfferCard";
import { serverApi, type Offer } from "@/lib/api";

export const metadata: Metadata = {
  title: "Explore affiliate offers from brands worldwide",
  description: "Browse funded affiliate campaigns on NetAffil. Compare commission, conversion type, cookie window and target markets, then get your link in one click.",
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
  const searching = !!(sp.q || sp.category);

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">Explore</p>
          <h1>Find offers <span className="grad">worth promoting.</span></h1>
          <p className="lede">Funded campaigns from brands worldwide. Compare commissions, markets and cookie windows, then grab your link.</p>
          <form role="search" action="/offers" className="row" style={{ marginTop: 24, maxWidth: 640 }}>
            <label htmlFor="q" className="sr-only">Search offers</label>
            <input id="q" name="q" className="input" style={{ flex: 1, minWidth: 220 }} defaultValue={sp.q} placeholder="Search offers, e.g. solar, software, fashion" />
            <button className="btn" type="submit">Search</button>
          </form>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 48 }}>
        <div className="container">
          {sp.link === "expired" && (
            <div className="alert info" role="status">That link&apos;s campaign has ended. Here are campaigns that are live right now.</div>
          )}
          {!ok && <div className="alert error" role="alert">Offers could not be loaded just now. Please try again in a minute.</div>}

          {offers.length > 0 && (
            <ul className="offer-grid">{offers.map((o) => <OfferCard key={o.id} o={o} />)}</ul>
          )}

          {ok && offers.length === 0 && (
            <>
              <div className="card spread" style={{ marginBottom: 32 }}>
                <div>
                  <h2 style={{ fontSize: "1.5rem", margin: 0 }}>{searching ? "No live offers match that search" : "The first campaigns are launching"}</h2>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    Create your account now and you&apos;ll be ready the moment they go live. Brands can launch the first ones.
                  </p>
                </div>
                <div className="row">
                  <Link href="/signup?role=publisher" className="btn">Join as an affiliate</Link>
                  <Link href="/signup?role=advertiser" className="btn ghost">Launch a campaign <Icon.arrow /></Link>
                </div>
              </div>
              {!searching && (
                <>
                  <h2 style={{ fontSize: "1.4rem" }}>What campaigns look like</h2>
                  <ul className="offer-grid">{EXAMPLE_OFFERS.map((o) => <OfferCard key={o.title} o={o} />)}</ul>
                  <p className="muted" style={{ marginTop: 16, fontSize: ".9rem" }}>These are illustrative examples, not live campaigns.</p>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
