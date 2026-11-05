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
      <h2 id="cookies">Cookies and analytics</h2>
      <p>
        We use a session cookie to keep you signed in, and remember your light or dark theme and your cookie choice in your
        browser. These are essential and always on.
      </p>
      <p>
        Only if you accept cookies do we use Google Analytics, through Google Tag Manager, to understand how visitors find
        and use the site. Its cookies record information such as the pages you view, your browser and approximate location,
        and Google processes this data under its own privacy policy. If you reject them, or haven&apos;t chosen yet, no
        analytics or advertising cookies are set. You can change your choice at any time with &ldquo;Cookie settings&rdquo;
        at the bottom of every page.
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
