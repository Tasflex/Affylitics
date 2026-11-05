import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icons";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbs, faqPage, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Launch an affiliate program: reach affiliates in every market",
  description:
    "Start an affiliate program on NetAffil. Launch CPS, CPA or CPL campaigns, reach affiliates worldwide, pay only for confirmed results from a funded escrow and track with signed postbacks.",
  path: "/advertisers",
});

const SIGNATURE_EXAMPLE = `ts=$(date +%s)
body='{"click_id":"<aff_click from your landing URL>","external_ref":"order-1042","sale_cents":4999}'
sig=$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac "$POSTBACK_SECRET" -hex | cut -d' ' -f2)

curl https://netaffil.com/api/postback \\
  -H "Content-Type: application/json" \\
  -H "X-NetAffil-Brand: $BRAND_ID" \\
  -H "X-NetAffil-Timestamp: $ts" \\
  -H "X-NetAffil-Signature: $sig" \\
  -d "$body"`;

const FAQ = [
  { q: "What does NetAffil cost?", a: "No setup or monthly fees. You pay the commission you set plus a 20% platform fee, only on confirmed conversions." },
  { q: "How do I control spend?", a: "Campaigns draw from an escrow you top up. If it runs low, your campaigns pause automatically, so you never owe more than you funded." },
  { q: "What if a customer refunds?", a: "Every campaign has a hold period you choose. Reject a conversion during it, with a reason, and the commission and fee return to your escrow." },
  { q: "What's the minimum to get started?", a: "There's no minimum contract. You can fund escrow from $10 per top-up, and campaigns go live as soon as they're funded." },
  { q: "Do I need a developer?", a: "Someone who can add one server request to your order confirmation. When an order is confirmed, your backend sends a signed postback to NetAffil; the example on this page works from any language." },
  { q: "Can I target specific countries?", a: "Yes. Limit a campaign to the countries where you sell. Affiliates promoting it can be anywhere, because they reach audiences across borders." },
];

export default function Advertisers() {
  return (
    <>
      <section className="page-hero dark">
        <div className="container">
          <p className="eyebrow">For brands &amp; advertisers</p>
          <h1>Let people sell <span className="grad">your products.</span></h1>
          <p className="lede">
            Reach new markets through affiliates who influence buying decisions: local creators, niche bloggers,
            community leaders and comparison sites. You set the commission. You pay only for results.
          </p>
          <div className="row" style={{ marginTop: 28 }}>
            <Link href="/signup?role=advertiser" className="btn warm lg">Launch a campaign <Icon.arrow /></Link>
            <Link href="#tracking" className="btn outline-light lg">See how tracking works</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="grid cols-4">
            <div className="trust-card"><span className="icon-tile orange"><Icon.megaphone /></span><h3>Flexible campaigns</h3><p>Revenue share per sale, a fixed amount per action, or per lead. Your rules, your markets.</p></div>
            <div className="trust-card"><span className="icon-tile orange"><Icon.globe /></span><h3>Every market</h3><p>Affiliates from every region, writing in their own languages for their own audiences.</p></div>
            <div className="trust-card"><span className="icon-tile"><Icon.chart /></span><h3>Live performance</h3><p>Clicks, conversions and costs per campaign, with the conversion log you can audit.</p></div>
            <div className="trust-card"><span className="icon-tile"><Icon.shield /></span><h3>Spend you control</h3><p>A funded escrow, automatic pausing, hold periods and fraud scoring on every click.</p></div>
          </div>
        </div>
      </section>

      <section className="section surface">
        <div className="container">
          <div className="section-head"><p className="eyebrow">Get started</p><h2>Live in four steps</h2></div>
          <ol className="steps">
            <li><h3>Add your brand</h3><p className="muted">Your website and a postback secret for server-to-server tracking.</p></li>
            <li><h3>Create a campaign</h3><p className="muted">Commission type and rate, cookie window, hold period, target countries.</p></li>
            <li><h3>Fund escrow</h3><p className="muted">Top up by card, mobile money or bank. Campaigns go live once funded.</p></li>
            <li><h3>Confirm conversions</h3><p className="muted">Send a signed postback per sale. Reject refunds during the hold period.</p></li>
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="pricing">
        <div className="container payout-grid">
          <div>
            <p className="eyebrow">Pricing</p>
            <h2 id="pricing">Pay for results, nothing else</h2>
            <p className="lede">
              No setup fee, no monthly fee, no minimum contract. You choose the commission; NetAffil adds a 20% platform fee
              on top, charged only when a conversion is confirmed.
            </p>
            <ul className="check-list">
              <li>Affiliates see and earn your full commission</li>
              <li>Rejected conversions refund the commission and the fee</li>
              <li>Campaigns pause automatically when escrow runs low</li>
            </ul>
          </div>
          <div className="calc card" role="group" aria-label="Example cost per conversion">
            <div className="calc-row"><span>Commission you set</span><strong>$10.00</strong></div>
            <div className="calc-row"><span>Platform fee (20%)</span><strong>$2.00</strong></div>
            <div className="calc-row total"><span>Cost per confirmed sale</span><strong>$12.00</strong></div>
            <p className="muted" style={{ margin: "12px 0 0", fontSize: ".9rem" }}>Example with a fixed $10 commission. Revenue-share offers work the same way on the sale value.</p>
          </div>
        </div>
      </section>

      <section className="section surface" id="tracking">
        <div className="container payout-grid" style={{ alignItems: "start" }}>
          <div>
            <p className="eyebrow">Tracking</p>
            <h2>One signed request per conversion</h2>
            <p className="lede">
              Each click lands on your site with an <code className="code">aff_click</code> parameter. Store it with the
              order; when the order is confirmed, sign the body with your postback secret (HMAC-SHA256 over
              <code className="code">timestamp.body</code>) and send it to NetAffil.
            </p>
            <ul className="check-list">
              <li>Duplicates are ignored, so retries are safe</li>
              <li>Requests older than 5 minutes are rejected</li>
              <li>Works from any backend language</li>
            </ul>
          </div>
          <pre className="card code" style={{ overflowX: "auto", whiteSpace: "pre", margin: 0, fontSize: ".85rem" }} tabIndex={0} aria-label="Example postback request">
            {SIGNATURE_EXAMPLE}
          </pre>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: 860 }}>
          <h2>Brand questions</h2>
          <div className="faq">
            {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
          </div>
          <div className="row" style={{ marginTop: 32 }}>
            <Link href="/signup?role=advertiser" className="btn lg">Advertise with NetAffil <Icon.arrow /></Link>
          </div>
        </div>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [breadcrumbs([{ name: "Home", path: "/" }, { name: "For brands", path: "/advertisers" }]), faqPage(FAQ)],
        }}
      />
    </>
  );
}
