import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { allCountries } from "@/lib/rails";

export const metadata: Metadata = {
  title: "Create your free account",
  description: "Join NetAffil free as an affiliate or a brand.",
  alternates: { canonical: "/signup" },
};

export default function Signup() {
  const countries = allCountries().map(({ code, name }) => ({ code, name }));
  return (
    <div className="container section" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: "2.4rem" }}>Join NetAffil</h1>
      <p className="muted">Free for affiliates. Brands pay only for results.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <Suspense>
          <AuthForm mode="signup" countries={countries} />
        </Suspense>
      </div>
    </div>
  );
}
