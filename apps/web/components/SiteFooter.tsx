import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link href="/" className="brand" aria-label="Affylitics home">
              <img src="/logo.png" alt="" width={36} height={36} />
              <span>Affylitics</span>
            </Link>
            <p className="muted" style={{ marginTop: 12, maxWidth: "40ch" }}>
              The affiliate network open to every country we can legally pay. Funded offers, local payouts, an honest ledger.
            </p>
          </div>
          <div>
            <h2>Earn</h2>
            <ul>
              <li><Link href="/publishers">For publishers</Link></li>
              <li><Link href="/offers">Browse offers</Link></li>
              <li><Link href="/payouts">Payouts by country</Link></li>
            </ul>
          </div>
          <div>
            <h2>Grow</h2>
            <ul>
              <li><Link href="/advertisers">For advertisers</Link></li>
              <li><Link href="/signup?role=advertiser">List an offer</Link></li>
              <li><a href="https://affylitics.com">Reviews blog</a></li>
            </ul>
          </div>
          <div>
            <h2>Company</h2>
            <ul>
              <li><Link href="/legal/terms">Terms</Link></li>
              <li><Link href="/legal/privacy">Privacy</Link></li>
              <li><Link href="/accessibility">Accessibility</Link></li>
            </ul>
          </div>
        </div>
        <p className="legal-line">© {year} Affylitics. All rights reserved.</p>
      </div>
    </footer>
  );
}
