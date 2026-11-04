import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Sign in",
  alternates: { canonical: "/login" },
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default function Login() {
  return (
    <div className="container section" style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: "2.4rem" }}>Welcome back</h1>
      <div className="card" style={{ marginTop: 24 }}>
        <Suspense>
          <AuthForm mode="login" googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />
        </Suspense>
      </div>
    </div>
  );
}
