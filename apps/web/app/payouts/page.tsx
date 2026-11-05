import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icons";
import { JsonLd } from "@/components/JsonLd";
import { PopularCountries, regionAnchor } from "@/components/Marketing";
import { allCountries, KIND_LABEL, REGION_NAMES } from "@/lib/rails";
import { breadcrumbs, faqPage, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Affiliate payouts by country: M-Pesa, mobile money, UPI, PIX, PayPal",
  description:
    "See how NetAffil pays affiliates in every country: M-Pesa, MTN MoMo, Airtel Money, UPI, PIX, SEPA, ACH, PayPal, Payoneer and USDC, with minimum withdrawals, fees and timing.",
  path: "/payouts",
});

const KIND_TEXT: Record<string, string> = {
  mobile_money: "M-Pesa, MTN MoMo, Airtel Money and more, straight to your phone.",
  instant_bank: "UPI, PIX, SEPA, Faster Payments and other real-time bank rails.",
  bank: "Transfers to a local bank account in your own currency.",
  wallet: "PayPal, Payoneer and popular national wallets.",
  stablecoin: "USDC to your own wallet, for anywhere other rails don't reach.",
};

const FAQ = [
  { q: "What currency are commissions in?", a: "Balances are held in US dollars. When you withdraw, the payout is converted to your local currency at the day's exchange rate." },
  { q: "How long do payouts take?", a: "It depends on the method: mobile money and instant bank rails are usually fastest, bank transfers can take longer. Each country page lists the timing for every method." },
  { q: "Are there payout fees?", a: "Some methods have a small fee. Each country page lists the fee for every method, so you can pick the one that suits you." },
  { q: "What do I need before my first withdrawal?", a: "A one-time identity check with a government ID, and a saved payout method in your name." },
];

export default function PayoutsIndex() {
  const countries = allCountries();
  const kinds = Object.keys(KIND_TEXT).map((k) => ({
    kind: k,
    count: countries.filter((c) => c.rails.some((r) => r.kind === k)).length,
  }));
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <nav aria-label="Breadcrumb" className="muted" style={{ fontSize: ".92rem", marginBottom: 16 }}>
            <Link href="/">Home</Link> <span aria-hidden="true">/</span> <span aria-current="page">Payouts</span>
          </nav>
          <p className="eyebrow">Payouts</p>
          <h1>Get paid in <span className="grad">{countries.length} countries</span></h1>
          <p className="lede">
            Earn in US dollars, withdraw the way people in your country actually move money. Choose your country to see
            every payout method, the smallest amount you can withdraw, fees and how fast it arrives.
          </p>
          <div className="row" style={{ marginTop: 28 }}>
            <Link href="/signup?role=publisher" className="btn lg">Join free <Icon.arrow /></Link>
            <Link href="#all-countries" className="btn lg ghost">Find your country</Link>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="methods">
        <div className="container">
          <h2 id="methods">Five ways to get paid</h2>
          <div className="grid cols-3" style={{ marginTop: 24 }}>
            {kinds.map((k) => (
              <div key={k.kind} className="trust-card">
                <h3>{KIND_LABEL[k.kind]}</h3>
                <p>{KIND_TEXT[k.kind]}</p>
                <p className="pill" style={{ marginTop: 14 }}>Available in {k.count} countries</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section surface" aria-labelledby="popular">
        <div className="container">
          <h2 id="popular">Popular countries</h2>
          <PopularCountries />
        </div>
      </section>

      <section className="section" aria-labelledby="all-countries-h" id="all-countries">
        <div className="container">
          <h2 id="all-countries-h">All countries by region</h2>
          {REGION_NAMES.map((region) => {
            const list = countries.filter((c) => c.region === region);
            return (
              <section key={region} id={regionAnchor(region)} aria-labelledby={`${regionAnchor(region)}-h`} style={{ marginTop: 40, scrollMarginTop: 90 }}>
                <h3 id={`${regionAnchor(region)}-h`} style={{ fontSize: "1.4rem" }}>{region} <span className="muted" style={{ fontWeight: 600 }}>· {list.length}</span></h3>
                <ul className="country-list">
                  {list.map((c) => (
                    <li key={c.code}>
                      <Link href={`/payouts/${c.slug}`}>{c.name}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="muted" style={{ marginTop: 40 }}>
            Not listed? International sanctions law currently prevents payouts to Cuba, Iran, North Korea and Syria.
          </p>
        </div>
      </section>

      <section className="section surface">
        <div className="container" style={{ maxWidth: 860 }}>
          <h2>Payout questions</h2>
          <div className="faq">
            {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
          </div>
        </div>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [breadcrumbs([{ name: "Home", path: "/" }, { name: "Payouts", path: "/payouts" }]), faqPage(FAQ)],
        }}
      />
    </>
  );
}
