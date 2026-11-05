import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icons";
import { JsonLd } from "@/components/JsonLd";
import { PopularCountries, PromoteChannels } from "@/components/Marketing";
import { RailFinder } from "@/components/RailFinder";
import { breadcrumbs, faqPage, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Join an affiliate program free: promote global brands, get paid locally",
  description:
    "Join NetAffil free as an affiliate. Promote funded offers from brands worldwide, keep 100% of the advertised commission and withdraw by M-Pesa, mobile money, local bank, UPI, PIX, PayPal or USDC.",
  path: "/publishers",
});

const FAQ = [
  { q: "Does it cost anything to join?", a: "No. Joining NetAffil is free for affiliates, and you keep the full commission shown on every offer. Brands pay the platform fee." },
  { q: "Do I need a website?", a: "No. You can promote from a blog, YouTube channel, TikTok, Instagram, a newsletter, a WhatsApp or Telegram community, or any channel the offer allows." },
  { q: "When can I withdraw?", a: "Commissions are pending during the campaign's hold period (usually 30 days, to cover returns), then become available. You verify your identity once before your first withdrawal." },
  { q: "Which countries can join?", a: "Affiliates from almost every country can join and earn. International sanctions law prevents payouts to Cuba, Iran, North Korea and Syria." },
  { q: "How do I get my affiliate link?", a: "Create a free account, open any offer and press \"Get my affiliate link\". Your link is ready instantly, and you can add a sub-ID to track each post, video or group separately." },
  { q: "How much can I earn?", a: "It depends on the offer's commission and how many people buy through your link. There's no cap: you earn the advertised commission on every confirmed sale or lead." },
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

      <section className="section surface" aria-labelledby="channels">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Ways to promote</p>
            <h2 id="channels">Promote wherever your audience is</h2>
            <p className="lede">No website? No problem. Choose the channels that suit you; each offer lists the ones its brand allows.</p>
          </div>
          <PromoteChannels />
        </div>
      </section>

      <section className="section" aria-labelledby="earn">
        <div className="container payout-grid">
          <div>
            <p className="eyebrow">How earnings add up</p>
            <h2 id="earn">You keep the full commission</h2>
            <p className="lede">
              Brands pay NetAffil&apos;s fee on top, so the rate you see on an offer is the rate you earn. Here&apos;s how one
              revenue-share offer could work out.
            </p>
            <p className="muted" style={{ fontSize: ".92rem" }}>Illustration only. Real earnings depend on the offer and your audience.</p>
          </div>
          <div className="calc card" role="group" aria-label="Example earnings calculation">
            <div className="calc-row"><span>Product price</span><strong>$40.00</strong></div>
            <div className="calc-row"><span>Commission rate</span><strong>30% per sale</strong></div>
            <div className="calc-row"><span>You earn per sale</span><strong>$12.00</strong></div>
            <div className="calc-row"><span>Sales in a month</span><strong>25</strong></div>
            <div className="calc-row total"><span>Monthly commission</span><strong>$300.00</strong></div>
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

      <section className="section" aria-labelledby="pcountries">
        <div className="container">
          <h2 id="pcountries">Get paid where you live</h2>
          <p className="lede">Payout methods, minimums and fees for the countries our affiliates ask about most.</p>
          <PopularCountries />
        </div>
      </section>

      <section className="section surface">
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

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [breadcrumbs([{ name: "Home", path: "/" }, { name: "For publishers", path: "/publishers" }]), faqPage(FAQ)],
        }}
      />
    </>
  );
}
