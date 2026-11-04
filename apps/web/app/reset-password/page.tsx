import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPassword } from "@/components/AccountForms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <div className="container section" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: "2.4rem" }}>Choose a new password</h1>
      <div className="card" style={{ marginTop: 24 }}>
        <Suspense><ResetPassword /></Suspense>
      </div>
    </div>
  );
}
