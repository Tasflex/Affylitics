import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({ title: "Terms of service", description: "The terms that apply to brands and affiliates using NetAffil.", path: "/legal/terms" });

export default function Terms() {
  return (
    <div className="container section prose">
      <h1>Terms of service</h1>
      <p className="muted">Draft for legal review. Last updated November 2026.</p>
      <h2>1. Who can join</h2>
      <p>Anyone aged 18 or over in a country we can lawfully pay. We cannot accept people or businesses on international sanctions lists, or residents of comprehensively sanctioned jurisdictions.</p>
      <h2>2. Publishers</h2>
      <p>You earn the commission shown on each offer for valid conversions. Commissions are pending during the offer&apos;s hold period and become available afterwards unless the advertiser rejects them with a reason. Fraudulent traffic, self-referrals, cookie stuffing, misleading claims and spam are prohibited and forfeit related earnings.</p>
      <h2>3. Advertisers</h2>
      <p>Offers go live only when your escrow covers them. Each confirmed conversion deducts the commission plus our platform fee from escrow. You may reject a conversion during its hold period for refunds, cancellations or fraud, and must give a reason. Unused escrow can be withdrawn on request, less payment processing costs.</p>
      <h2>4. Payouts and verification</h2>
      <p>Withdrawals require identity verification. Transfer fees are shown before you confirm and are charged at cost. Local-currency amounts use the exchange rate at the time of payout.</p>
      <h2>5. Liability</h2>
      <p>The service is provided as is. Our liability is limited to the fees we earned from you in the 12 months before a claim.</p>
    </div>
  );
}
