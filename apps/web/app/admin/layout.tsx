import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/brands", label: "Brands" },
  { href: "/admin/offers", label: "Campaigns" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/conversions", label: "Conversions" },
  { href: "/admin/escrow", label: "Escrow credit" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe("/admin");
  // Non-staff see the normal 404 page; the admin area isn't advertised.
  if (!me.is_admin) notFound();
  return (
    <div className="container dash">
      <nav className="dash-nav" aria-label="Admin">
        <p className="muted" style={{ fontSize: ".9rem", marginBottom: 12 }}><span className="pill orange">Staff</span> {me.display_name}</p>
        <ul>
          {NAV.map((n) => <li key={n.href}><Link href={n.href}>{n.label}</Link></li>)}
          <li><Link href="/dashboard" style={{ marginTop: 12 }}>← My dashboard</Link></li>
        </ul>
      </nav>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
