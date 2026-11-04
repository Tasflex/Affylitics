import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmail } from "@/components/AccountForms";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

export default function VerifyEmailPage() {
  return (
    <div className="container section" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: "2.4rem" }}>Confirm your email</h1>
      <p className="muted">One click and you&apos;re done.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <Suspense><VerifyEmail /></Suspense>
      </div>
    </div>
  );
}
