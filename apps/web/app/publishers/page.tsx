import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icons";
import { JsonLd } from "@/components/JsonLd";
import { RailFinder } from "@/components/RailFinder";

export const metadata: Metadata = {
  title: "For affiliates & publishers: promote global brands, get paid locally",
  description:
    "Join NetAffil free. Promote funded offers from brands worldwide, keep 100% of the advertised commission and withdraw by mobile money, local bank, UPI, PIX, PayPal or USDC.",
  alternates: { canonical: "/publishers" },
};

const FAQ = [
  { q: "Does it cost anything to join?", a: "No. Joining NetAffil is free for affiliates, and you keep the full commission shown on every offer. Brands pay the platform fee." },
  { q: "Do I need a website?", a: "No. You can promote from a blog, YouTube channel, TikTok, Instagram, a newsletter, a WhatsApp or Telegram community, or any channel the offer allows." },
  { q: "When can I withdraw?", a: "Commissions are pending during the campaign's hold period (usually 30 days, to cover returns), then become available. You verify your identity once before your first withdrawal." },
  { q: "What's the minimum withdrawal?", a: "It depends on the method: mobile money starts at $2, most bank and wallet options at $5–10. Your country's page shows every option." },
];

export default function Publishers() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">For affiliates &amp; publishers</p>
          <h1>Turn your audience <span className="grad">into income.</span></h1>
          <p className="lede">
            Bloggers, creators, community builders and deal sites: discover campaigns from brands around the world, share
            your link and earn on every confirmed sale or lead.
          </p>
          <div className="row" style={{ marginTop: 28 }}>
            <Link href="/signup?role=publisher" className="btn lg">Become a publisher <Icon.arrow /></Link>
            <Link href="/offers" className="btn lg ghost">Explore offers</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="grid cols-4">
            <div className="trust-card"><span className="icon-tile"><Icon.bag /></span><h3>Offers worth promoting</h3><p>Compare commission, cookie window and target markets before you join a campaign.</p></div>
            <div className="trust-card"><span className="icon-tile"><Icon.shield /></span><h3>Commissions you can count on</h3><p>Every campaign is funded up front, and your commission is reserved the moment a sale is confirmed.</p></div>
            <div className="trust-card"><span className="icon-tile orange"><Icon.link /></span><h3>Smart links</h3><p>One link per offer, with optional sub-IDs to see which post, video or channel converts.</p></div>
            <div className="trust-card"><span className="icon-tile orange"><Icon.wallet /></span><h3>Local withdrawals</h3><p>Mobile money, local bank, instant bank rails, PayPal, Payoneer or USDC.</p></div>
          </div>
        </div>
      </section>

      <section className="section surface">
        <div className="container payout-grid">
          <div>
            <p className="eyebrow">Your dashboard</p>
            <h2>Everything in one place</h2>
            <ul className="check-list">
              <li>Clicks, sales and earnings per link</li>
              <li>Pending, available and paid-out balances</li>
              <li>Saved payout methods, encrypted and masked</li>
              <li>A ledger entry behind every cent</li>
            </ul>
            <Link href="/signup?role=publisher" className="btn">Create your free account <Icon.arrow /></Link>
          </div>
          <RailFinder />
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: 860 }}>
          <h2>Affiliate questions</h2>
          <div className="faq">
            {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
          </div>
          <p className="muted" style={{ marginTop: 24 }}>
            Fair play keeps brands funding campaigns: self-referrals, cookie stuffing, incentivised clicks and bot traffic
            are not allowed and lead to account closure.
          </p>
        </div>
      </section>

      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
    </>
  );
}
