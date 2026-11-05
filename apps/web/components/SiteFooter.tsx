import Link from "next/link";
import { CookieSettingsButton } from "./CookieConsent";
import { Logo } from "./Logo";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p className="muted" style={{ marginTop: 14, maxWidth: "38ch" }}>
              Connecting brands, empowering affiliates, everywhere. The world is your marketplace.
            </p>
          </div>
          <div>
            <h2>Affiliates</h2>
            <ul>
              <li><Link href="/publishers">For publishers</Link></li>
              <li><Link href="/offers">Explore offers</Link></li>
              <li><Link href="/payouts">Payouts by country</Link></li>
            </ul>
          </div>
          <div>
            <h2>Brands</h2>
            <ul>
              <li><Link href="/advertisers">For brands</Link></li>
              <li><Link href="/signup?role=advertiser">Launch a campaign</Link></li>
              <li><Link href="/advertisers#tracking">Tracking &amp; postbacks</Link></li>
            </ul>
          </div>
          <div>
            <h2>Company</h2>
            <ul>
              <li><Link href="/legal/terms">Terms</Link></li>
              <li><Link href="/legal/privacy">Privacy</Link></li>
              <li><Link href="/accessibility">Accessibility</Link></li>
              <li><CookieSettingsButton /></li>
            </ul>
          </div>
        </div>
        <div className="legal-line">
          <span>© {year} NetAffil. All rights reserved.</span>
          <span>Brands meet affiliates, in every market.</span>
        </div>
      </div>
    </footer>
  );
}
