import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Affiliate program open to every country",
  description:
    "Become an Affylitics publisher from any country. Promote escrow-funded offers, keep 100% of your commission and withdraw by M-Pesa, mobile money, bank, PayPal or USDC.",
  alternates: { canonical: "/publishers" },
};

export default function Publishers() {
  return (
    <div className="container section">
      <p className="eyebrow">For publishers</p>
      <h1>Your audience is valuable wherever you are</h1>
      <p className="lede">
        Bloggers, creators, WhatsApp community admins and coupon sites in every country can join Affylitics and earn from
        brands that want to reach their audience.
      </p>
      <div className="row" style={{ margin: "24px 0 48px" }}>
        <Link href="/signup?role=publisher" className="btn">Join as a publisher</Link>
        <Link href="/offers" className="btn ghost">Browse offers first</Link>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2 style={{ fontSize: "1.5rem" }}>What you get</h2>
          <ul>
            <li>The full advertised commission. Our fee is paid by the advertiser.</li>
            <li>Commissions locked from escrow the moment a sale is recorded.</li>
            <li>Sub-IDs on every link to see which post or video converts.</li>
            <li>Payout minimums from $2 on mobile money.</li>
            <li>A ledger of every entry behind your balance.</li>
          </ul>
        </div>
        <div className="card">
          <h2 style={{ fontSize: "1.5rem" }}>How payouts work</h2>
          <ol>
            <li>A sale or lead is recorded and appears as <strong>pending</strong>.</li>
            <li>After the offer&apos;s hold period (usually 30 days, for returns) it becomes <strong>available</strong>.</li>
            <li>Verify your identity once with a local ID.</li>
            <li>Withdraw to M-Pesa, mobile money, bank, UPI, PIX, PayPal, Payoneer or USDC.</li>
          </ol>
          <p><Link href="/payouts">Check the options in your country</Link></p>
        </div>
      </div>

      <h2 style={{ marginTop: 56 }}>Fair play rules</h2>
      <div className="prose">
        <p>
          We protect advertisers so they keep funding offers for you. Clicks are scored for fraud, and advertisers can reject
          a conversion during the hold period (for a refund or cancelled order), always with a written reason you can see.
          Self-referrals, cookie stuffing, incentivised clicks and bot traffic lead to account closure.
        </p>
      </div>
    </div>
  );
}
