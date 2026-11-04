import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { allCountries } from "@/lib/rails";

export const metadata: Metadata = {
  title: "Create your free account",
  description: "Join NetAffil free as an affiliate or a brand. Sign up with Google or email.",
  alternates: { canonical: "/signup" },
};

// Reads server env at request time so enabling Google sign-in needs no rebuild.
export const dynamic = "force-dynamic";

export default function Signup() {
  const countries = allCountries().map(({ code, name }) => ({ code, name }));
  return (
    <div className="container section" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: "2.4rem" }}>Join NetAffil</h1>
      <p className="muted">Free for affiliates. Brands pay only for results. Takes about two minutes.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <Suspense>
          <AuthForm mode="signup" countries={countries} googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />
        </Suspense>
      </div>
    </div>
  );
}
