import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({ title: "Privacy policy", description: "What data NetAffil collects, why, the cookies and analytics we use, and your rights.", path: "/legal/privacy" });

export default function Privacy() {
  return (
    <div className="container section prose">
      <h1>Privacy policy</h1>
      <p className="muted">Draft for legal review. Last updated November 2026.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email, country, role.</li>
        <li>Payout details: encrypted at rest; only the last four characters are ever shown back.</li>
        <li>Click data: a salted one-way hash of the visitor&apos;s IP address and browser, their country and the referring site. We do not store raw IP addresses.</li>
        <li>Verification results from Smile ID or Sumsub. Document images stay with those providers.</li>
      </ul>
      <h2>Cookies and analytics</h2>
      <p>
        We use a session cookie to keep you signed in, and remember your light or dark theme in your browser. To understand
        how visitors find and use the site, we use Google Tag Manager and Google Analytics, which set their own cookies and
        receive information such as the pages you view, your browser and approximate location. Google processes this data
        under its own privacy policy. You can block these cookies in your browser settings or with Google&apos;s opt-out
        browser add-on without affecting your account.
      </p>
      <h2>Why</h2>
      <p>To run the network, pay commissions, prevent fraud and meet legal obligations such as anti-money-laundering checks.</p>
      <h2>Your rights</h2>
      <p>You can request a copy of your data, correction or deletion. Financial records are kept for the period the law requires. This policy is written to meet GDPR, Kenya&apos;s Data Protection Act, Nigeria&apos;s NDPA and South Africa&apos;s POPIA.</p>
      <h2>Contact</h2>
      <p>privacy@netaffil.com</p>
    </div>
  );
}
