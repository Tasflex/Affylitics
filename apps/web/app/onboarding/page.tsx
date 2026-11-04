import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { allCountries } from "@/lib/rails";
import { requireMe } from "@/lib/session";

export const metadata: Metadata = { title: "Set up your account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const me = await requireMe("/onboarding");
  if (me.onboarded) redirect(me.role === "advertiser" ? "/dashboard/advertiser" : "/dashboard");
  const countries = allCountries().map(({ code, name }) => ({ code, name }));
  return (
    <div className="container section" style={{ maxWidth: 820, paddingTop: 48 }}>
      <Onboarding
        initialRole={me.role}
        initialCountry={me.country}
        initialName={me.display_name}
        initialProfile={me.profile}
        countries={countries}
      />
    </div>
  );
}
