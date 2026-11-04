"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/offers", label: "Explore" },
  { href: "/publishers", label: "For Publishers" },
  { href: "/advertisers", label: "For Brands" },
  { href: "/payouts", label: "Payouts by Country" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="site-header">
      <div className="container">
        <Logo />
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
          <span className="sep" aria-hidden="true" />
          <Link href="/login" className="navlink">Sign in</Link>
          <Link href="/signup" className="btn small">Join free</Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
