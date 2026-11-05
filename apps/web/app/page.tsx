import type { Metadata } from "next";
import Link from "next/link";
import { HeroScene } from "@/components/HeroScene";
import { Icon } from "@/components/Icons";
import { JsonLd } from "@/components/JsonLd";
import { PopularCountries, PromoteChannels, regionAnchor } from "@/components/Marketing";
import { EXAMPLE_OFFERS, OfferCard } from "@/components/OfferCard";
import { RailFinder } from "@/components/RailFinder";
import { serverApi, type Offer } from "@/lib/api";
import { allCountries, REGION_NAMES } from "@/lib/rails";
import { faqPage, pageMeta } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  ...pageMeta({
    title: `${SITE_NAME}: Global Affiliate Marketplace with Local Payouts`,
    description:
      "Join NetAffil, the global affiliate network. Affiliates promote funded offers and withdraw by M-Pesa, mobile money, UPI, PIX, bank or PayPal. Brands pay only for confirmed sales.",
    path: "/",
  }),
  // The home page title is complete on its own; skip the "| NetAffil" template.
  title: { absolute: `${SITE_NAME}: Global Affiliate Marketplace with Local Payouts` },
};

const FAQ = [
  {
    q: "What is affiliate marketing?",
    a: "Affiliate marketing is a way to earn by recommending products. A brand gives you a unique link; when someone buys or signs up through it, you earn a commission. Brands only pay for real results, and affiliates don't need to hold stock or handle customers.",
  },
  {
    q: "Can I do affiliate marketing without a website?",
    a: "Yes. Many NetAffil affiliates promote from YouTube, TikTok, Instagram, newsletters or WhatsApp and Telegram communities. Each offer lists the channels the brand allows.",
  },
  {
    q: "Who can join NetAffil?",
    a: "Brands of any size that sell online, and affiliates anywhere in the world: bloggers, creators, community admins, comparison and coupon sites. Joining is free for affiliates.",
  },
  {
    q: "How do affiliates get paid?",
    a: "Through the methods that work in your country: mobile money such as M-Pesa, MTN MoMo and Airtel Money, instant bank rails such as UPI, PIX and SEPA, local bank transfer, PayPal, Payoneer or USDC. Each country page lists minimums, fees and timing.",
  },
  {
    q: "How are commissions protected?",
    a: "Brands fund an escrow balance before a campaign goes live. When a sale is confirmed, the commission is set aside from that escrow immediately, and becomes withdrawable after the campaign's hold period.",
  },
  {
    q: "What does it cost brands?",
    a: "No setup or monthly fees. Brands pay the commission they choose plus a 20% platform fee, only on confirmed results.",
  },
  {
    q: "How is tracking done?",
    a: "Every click gets a unique ID. Brands confirm conversions with a signed server-to-server postback, so results can't be faked from the browser, and both sides see the same numbers.",
  },
];

export default async function Home() {
  const countries = allCountries();
  const live = ((await serverApi<Offer[]>("/api/offers", { revalidate: 300 })).data ?? []).slice(0, 8);
  const offers = live.length >= 4 ? live : [...live, ...EXAMPLE_OFFERS.slice(0, 4 - live.length)];
  const byRegion = REGION_NAMES.map((r) => ({ region: r, list: countries.filter((c) => c.region === r) }));

  return (
    <>
      {/* 1–2 · Hero */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">Affiliate marketing without borders</p>
            <h1>
              The world is your <span className="grad">affiliate marketplace.</span>
            </h1>
            <p className="tagline"><span>Connect</span><span>Promote</span><span>Earn</span><span>Get paid</span></p>
            <p className="lede">
              NetAffil connects brands with affiliates worldwide. Brands reach new markets through people who influence
              buying decisions. Affiliates discover great products, earn commissions and withdraw through payment methods
              that work in their country.
            </p>
            <div className="actions">
              <Link href="/publishers" className="btn lg">I&apos;m an affiliate <Icon.arrow /></Link>
              <Link href="/advertisers" className="btn lg ghost">I&apos;m a brand <Icon.arrow /></Link>
            </div>
            <div className="hero-points">
              <div className="hero-point">
                <span className="icon-tile"><Icon.globe /></span>
                <div><strong>Global opportunities</strong><span>Connect across markets and borders.</span></div>
              </div>
              <div className="hero-point">
                <span className="icon-tile orange"><Icon.wallet /></span>
                <div><strong>Local payments</strong><span>Payout options that fit {countries.length} countries.</span></div>
              </div>
            </div>
          </div>
          <HeroScene />
        </div>
      </section>

      {/* 3 · Two audience pathways */}
      <section className="section" aria-labelledby="paths">
        <div className="container">
          <div className="section-head center">
            <p className="eyebrow">Two sides, one marketplace</p>
            <h2 id="paths">Brands find people who sell. People find brands that pay.</h2>
          </div>
          <div className="paths">
            <article className="path pub">
              <span className="who">For affiliates &amp; publishers</span>
              <h3 className="path-title">Turn your audience into income.</h3>
              <p>Find products worth promoting, join campaigns from brands around the world, and earn from the traffic you already have.</p>
              <ul className="check-list">
                <li>Browse funded affiliate offers</li>
                <li>Compare commissions, cookie windows and markets</li>
                <li>Track every click, sale and payout in real time</li>
                <li>Withdraw with local payment options</li>
              </ul>
              <Link href="/publishers" className="btn">Become a publisher <Icon.arrow /></Link>
            </article>
            <article className="path brand-path">
              <span className="who">For brands &amp; advertisers</span>
              <h3 className="path-title">Let people sell your products.</h3>
              <p>Connect with affiliates who introduce your products to new audiences and new markets, and pay only for results.</p>
              <ul className="check-list">
                <li>Launch CPS, CPA or CPL campaigns in minutes</li>
                <li>Reach publishers in every region</li>
                <li>Monitor clicks, conversions and costs</li>
                <li>Control spend with a funded escrow</li>
              </ul>
              <Link href="/advertisers" className="btn warm">Advertise with NetAffil <Icon.arrow /></Link>
            </article>
          </div>
        </div>
      </section>

      {/* 4 · Payment network */}
      <section className="section surface" aria-labelledby="payouts">
        <div className="container payout-grid">
          <div>
            <p className="eyebrow">Global payout network</p>
            <h2 id="payouts">Earn globally. <span className="grad">Withdraw locally.</span></h2>
            <p className="lede">
              Where you live shouldn&apos;t decide how you get paid. Every country has its own way of moving money,
              and NetAffil pays out through the ones people actually use.
            </p>
            <ul className="check-list" style={{ marginTop: 24 }}>
              <li>Mobile money from $2, including M-Pesa, MTN MoMo, Airtel Money, Orange Money and Wave</li>
              <li>Instant bank rails such as UPI, PIX, SPEI, SEPA and Faster Payments</li>
              <li>PayPal, Payoneer and USDC as global options</li>
              <li>Minimums, fees and timing shown before you withdraw</li>
            </ul>
            <Link href="/payouts" className="btn secondary">Payouts by country <Icon.arrow /></Link>
          </div>
          <RailFinder />
        </div>
      </section>

      {/* 5 · Featured offers */}
      <section className="section" aria-labelledby="offers">
        <div className="container">
          <div className="spread" style={{ marginBottom: 32, alignItems: "flex-end" }}>
            <div>
              <p className="eyebrow">Marketplace</p>
              <h2 id="offers" style={{ margin: 0 }}>Explore affiliate offers</h2>
            </div>
            <Link href="/offers" className="btn ghost">View all offers <Icon.arrow /></Link>
          </div>
          <ul className="offer-grid">
            {offers.map((o) => <OfferCard key={o.slug ?? o.title} o={o} />)}
          </ul>
          {live.length < 4 && (
            <p className="muted" style={{ marginTop: 16, fontSize: ".9rem" }}>
              Cards marked “Example offer” illustrate the kinds of campaigns on NetAffil; they are not live campaigns.
            </p>
          )}
        </div>
      </section>

      {/* Ways to promote */}
      <section className="section" aria-labelledby="channels" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Ways to promote</p>
            <h2 id="channels">Earn from the audience you already have</h2>
            <p className="lede">
              You don&apos;t need a big following or a website. Affiliates on NetAffil earn from search, video, social and
              messaging communities, in any language and from any country.
            </p>
          </div>
          <PromoteChannels />
        </div>
      </section>

      {/* 6 · How it works */}
      <section className="section surface" aria-labelledby="how">
        <div className="container">
          <div className="section-head center">
            <p className="eyebrow">How it works</p>
            <h2 id="how">From campaign to commission</h2>
          </div>
          <div className="how">
            <div className="how-col brand-col">
              <h3><span className="icon-tile orange" style={{ margin: 0, width: 40, height: 40 }}><Icon.megaphone /></span>For brands</h3>
              <ol className="timeline">
                <li><strong>Create your campaign</strong><span>Set the commission, cookie window, hold period and target markets.</span></li>
                <li><strong>Fund your escrow</strong><span>Top up by card, mobile money or bank. Campaigns go live once funded.</span></li>
                <li><strong>Affiliates promote you</strong><span>Publishers pick up your offer and send you qualified traffic.</span></li>
                <li><strong>Pay for results only</strong><span>Confirm sales by postback; reject refunds during the hold period.</span></li>
              </ol>
            </div>
            <div className="how-col">
              <h3><span className="icon-tile" style={{ margin: 0, width: 40, height: 40 }}><Icon.users /></span>For affiliates</h3>
              <ol className="timeline">
                <li><strong>Join free</strong><span>Sign up in two minutes from any country.</span></li>
                <li><strong>Pick an offer</strong><span>Compare rates, cookie windows and target markets.</span></li>
                <li><strong>Share your link</strong><span>Blog, video, social or messaging: every click is tracked.</span></li>
                <li><strong>Withdraw locally</strong><span>After the hold period, cash out the way you prefer.</span></li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* 7 · Trust */}
      <section className="section" aria-labelledby="trust">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Trust &amp; protection</p>
            <h2 id="trust">A better relationship between brands and affiliates</h2>
          </div>
          <div className="grid cols-4">
            <div className="trust-card">
              <span className="icon-tile"><Icon.shield /></span>
              <h3>Protected commissions</h3>
              <p>Campaigns are funded up front, and each confirmed commission is reserved from escrow the moment it&apos;s recorded.</p>
            </div>
            <div className="trust-card">
              <span className="icon-tile"><Icon.chart /></span>
              <h3>Transparent tracking</h3>
              <p>Unique click IDs and signed server-to-server postbacks. Both sides see the same clicks, conversions and approvals.</p>
            </div>
            <div className="trust-card">
              <span className="icon-tile orange"><Icon.badge /></span>
              <h3>Verified participants</h3>
              <p>Identity verification before payouts, fraud scoring on traffic, and verification badges for brands.</p>
            </div>
            <div className="trust-card">
              <span className="icon-tile orange"><Icon.receipt /></span>
              <h3>Transparent payouts</h3>
              <p>Fees, minimums and timing shown up front, and an itemised ledger behind every balance.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 8 · Global reach */}
      <section className="section surface" aria-labelledby="reach">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Global reach</p>
            <h2 id="reach">{countries.length} countries. One marketplace.</h2>
            <p className="lede">Affiliates and brands from every region, each with payout methods that suit their market.</p>
          </div>
          <div className="regions">
            {byRegion.map(({ region, list }) => (
              <Link key={region} href={`/payouts#${regionAnchor(region)}`} className="region">
                <div className="count">{list.length}</div>
                <div className="name">{region}</div>
                <div className="eg">{list.slice(0, 3).map((c) => c.name).join(", ")}…</div>
              </Link>
            ))}
          </div>
          <h3 style={{ marginTop: 48 }}>Popular payout countries</h3>
          <PopularCountries limit={12} />
          <Link href="/payouts" className="btn ghost" style={{ marginTop: 24 }}>See all {countries.length} countries <Icon.arrow /></Link>
        </div>
      </section>

      {/* 9 · Founding partners (instead of testimonials we don't have yet) */}
      <section className="section" aria-labelledby="founding">
        <div className="container">
          <div className="band band-grid">
            <div>
              <p className="eyebrow">Founding partners</p>
              <h2 id="founding">Be among the first brands and affiliates on NetAffil.</h2>
              <p className="lede">
                We&apos;re onboarding our first campaigns now. Early partners get hands-on help and a direct line to the team
                shaping the platform.
              </p>
              <div className="row" style={{ marginTop: 24 }}>
                <Link href="/signup?role=advertiser" className="btn warm lg">Launch a campaign <Icon.arrow /></Link>
                <Link href="/signup?role=publisher" className="btn outline-light lg">Join as an affiliate</Link>
              </div>
            </div>
            <div>
              <div className="perk"><span aria-hidden="true">✦</span><div><strong>Personal onboarding</strong>Help setting up tracking and your first campaign.</div></div>
              <div className="perk"><span aria-hidden="true">✦</span><div><strong>Featured placement</strong>Early campaigns appear first in the marketplace.</div></div>
              <div className="perk"><span aria-hidden="true">✦</span><div><strong>Shape the roadmap</strong>Tell us which markets and payout methods to add next.</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section tight" aria-labelledby="faq">
        <div className="container" style={{ maxWidth: 860 }}>
          <h2 id="faq">Questions, answered</h2>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 10 · Final CTA */}
      <section className="section" aria-labelledby="cta" style={{ paddingTop: 40 }}>
        <div className="container" style={{ textAlign: "center" }}>
          <h2 id="cta">Your location is not your limitation.</h2>
          <p className="lede" style={{ marginInline: "auto" }}>Join free and start connecting with brands and affiliates across the world.</p>
          <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
            <Link href="/signup?role=publisher" className="btn lg">Join as an affiliate</Link>
            <Link href="/signup?role=advertiser" className="btn lg ghost">Join as a brand</Link>
          </div>
        </div>
      </section>

      <JsonLd data={{ "@context": "https://schema.org", ...faqPage(FAQ) }} />
    </>
  );
}
