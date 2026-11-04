import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { RailFinder } from "@/components/RailFinder";
import { allCountries } from "@/lib/rails";

const FAQ = [
  {
    q: "Can I join from Kenya, Nigeria, Ghana or anywhere in Africa?",
    a: "Yes. Affylitics accepts publishers from every country we are legally allowed to pay. We pay out through M-Pesa, MTN MoMo, Airtel Money, Orange Money, Wave, local bank transfer and more, with minimums from $2.",
  },
  {
    q: "Do I need to verify my identity to start?",
    a: "No. You can sign up, create links and earn straight away. We only ask you to verify your identity before your first payout, using an ID you already have, such as your national ID card.",
  },
  {
    q: "What happens if an advertiser doesn't pay?",
    a: "That can't happen here. Advertisers fund an escrow balance before their offers go live, and each commission is set aside from that escrow the moment a sale is recorded.",
  },
  {
    q: "How much does Affylitics take from my commission?",
    a: "Nothing. You earn the full rate shown on the offer. Advertisers pay our fee on top. Payout transfer fees are charged at cost and shown before you withdraw.",
  },
  {
    q: "Which countries can't join?",
    a: "Only those under comprehensive international sanctions (currently Cuba, Iran, North Korea and Syria), because the law bars us from paying them. A few others are paid after a manual compliance review.",
  },
];

export default function Home() {
  const countries = allCountries();
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">Affiliate marketing without borders</p>
            <h1>
              Earn from great products. <span className="mark">Get paid where you live.</span>
            </h1>
            <p className="lede">
              Other networks turn you away because of your country. Affylitics welcomes publishers everywhere, guarantees
              every commission with advertiser escrow, and pays you by M-Pesa, mobile money, UPI, PIX, bank or USDC.
            </p>
            <div className="actions">
              <Link href="/signup" className="btn">Start earning free</Link>
              <Link href="/advertisers" className="btn secondary">I want affiliates</Link>
            </div>
            <div className="proof">
              <div><strong>{countries.length}</strong> countries paid</div>
              <div><strong>$2</strong> lowest payout</div>
              <div><strong>100%</strong> of your commission</div>
            </div>
          </div>
          <RailFinder />
        </div>
      </section>

      <section className="section" aria-labelledby="how">
        <div className="container">
          <p className="eyebrow">How it works</p>
          <h2 id="how">From link to local payout in four steps</h2>
          <ol className="steps" style={{ marginTop: 28 }}>
            <li>
              <h3>Join in two minutes</h3>
              <p className="muted">Email, password, country. No website traffic thresholds and no approval queue.</p>
            </li>
            <li>
              <h3>Pick funded offers</h3>
              <p className="muted">Every live offer is backed by money the advertiser has already deposited.</p>
            </li>
            <li>
              <h3>Share your link</h3>
              <p className="muted">Blog, YouTube, WhatsApp, TikTok. We track clicks and sales and show every one.</p>
            </li>
            <li>
              <h3>Withdraw locally</h3>
              <p className="muted">After the hold period, cash out to the rail you already use, in your own currency.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section" style={{ background: "var(--card)", borderBlock: "1px solid var(--border)" }} aria-labelledby="why">
        <div className="container">
          <p className="eyebrow">Why Affylitics</p>
          <h2 id="why">Built for the publishers the big networks ignore</h2>
          <div className="grid cols-3" style={{ marginTop: 28 }}>
            <div>
              <h3>No country gatekeeping</h3>
              <p className="muted">
                Sign-up is open worldwide. The only countries we can&apos;t accept are those international sanctions law forbids us to pay.
              </p>
            </div>
            <div>
              <h3>Escrow-backed commissions</h3>
              <p className="muted">
                Advertisers pre-fund. When a sale lands, your commission moves out of their escrow into your balance immediately.
              </p>
            </div>
            <div>
              <h3>Earn first, verify later</h3>
              <p className="muted">
                Identity checks happen at your first withdrawal, using local IDs like a Kenyan ID, NIN or Ghana Card.
              </p>
            </div>
            <div>
              <h3>Local rails, small minimums</h3>
              <p className="muted">Mobile money from $2. No more waiting months to reach a $100 threshold.</p>
            </div>
            <div>
              <h3>An open ledger</h3>
              <p className="muted">Every cent in your balance is backed by a ledger entry you can inspect, not a number we made up.</p>
            </div>
            <div>
              <h3>Accessible by design</h3>
              <p className="muted">Keyboard friendly, screen-reader tested patterns, high contrast and light on mobile data.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="faq">
        <div className="container">
          <h2 id="faq">Questions people ask</h2>
          <div className="faq prose">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          <div className="row" style={{ marginTop: 32 }}>
            <Link href="/signup" className="btn">Create your free account</Link>
            <Link href="/payouts" className="btn ghost">See every payout country</Link>
          </div>
        </div>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
    </>
  );
}
