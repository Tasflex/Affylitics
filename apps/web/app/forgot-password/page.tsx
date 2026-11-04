import type { Metadata } from "next";
import { ForgotPassword } from "@/components/AccountForms";

export const metadata: Metadata = { title: "Forgot your password?", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="container section" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: "2.4rem" }}>Forgot your password?</h1>
      <p className="muted">Enter your email and we&apos;ll send you a link to choose a new one. This also works if you usually sign in with Google and want a password too.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <ForgotPassword />
      </div>
    </div>
  );
}
