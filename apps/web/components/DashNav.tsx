"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";

const PUBLISHER = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/payouts", label: "Payouts" },
  { href: "/dashboard/kyc", label: "Verification" },
  { href: "/dashboard/ledger", label: "Ledger" },
];

const ADVERTISER = [
  { href: "/dashboard/advertiser", label: "Offers & escrow" },
  { href: "/dashboard/kyc", label: "Verification" },
  { href: "/dashboard/ledger", label: "Ledger" },
];

export function DashNav({ role, name }: { role: string; name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = role === "advertiser" ? ADVERTISER : PUBLISHER;
  return (
    <nav className="dash-nav" aria-label="Dashboard">
      <p className="muted" style={{ fontSize: ".9rem", marginBottom: 12 }}>Signed in as <strong>{name}</strong></p>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={pathname === l.href ? "page" : undefined}>{l.label}</Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="btn ghost small"
            style={{ marginTop: 12 }}
            onClick={async () => {
              await api("/api/auth/logout", {});
              router.push("/");
              router.refresh();
            }}
          >
            Sign out
          </button>
        </li>
      </ul>
    </nav>
  );
}
