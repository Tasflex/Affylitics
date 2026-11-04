"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/offers", label: "Offers" },
  { href: "/publishers", label: "Publishers" },
  { href: "/advertisers", label: "Advertisers" },
  { href: "/payouts", label: "Payouts by country" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="site-header">
      <div className="stripe" aria-hidden="true" />
      <div className="container">
        <Link href="/" className="brand" aria-label="Affylitics home">
          <img src="/logo.png" alt="" width={36} height={36} />
          <span>Affylitics</span>
        </Link>
        <button
          type="button"
          className="btn ghost small nav-toggle"
          aria-expanded={open}
          aria-controls="primary-nav"
          onClick={() => setOpen((v) => !v)}
        >
          Menu
        </button>
        <nav id="primary-nav" className="nav" aria-label="Primary" data-open={open}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="navlink" aria-current={pathname.startsWith(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="navlink">Sign in</Link>
          <Link href="/signup" className="btn small">Join free</Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
