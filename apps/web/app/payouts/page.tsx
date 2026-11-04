import type { Metadata } from "next";
import Link from "next/link";
import { allCountries, REGION_NAMES } from "@/lib/rails";

export const metadata: Metadata = {
  title: "Affiliate payouts in every country",
  description:
    "See how NetAffil pays affiliates in each country: M-Pesa, MTN MoMo, Airtel Money, UPI, PIX, SEPA, ACH, PayPal, Payoneer and USDC, with minimums and fees.",
  alternates: { canonical: "/payouts" },
};

export default function PayoutsIndex() {
  const countries = allCountries();
  return (
    <div className="container section">
      <p className="eyebrow">Payouts</p>
      <h1>Get paid in {countries.length} countries</h1>
      <p className="lede">
        Choose your country to see every way we can pay you, the smallest amount you can withdraw, fees and how fast the
        money arrives.
      </p>
      {REGION_NAMES.map((region) => {
        const list = countries.filter((c) => c.region === region);
        return (
          <section key={region} aria-labelledby={`r-${region}`} style={{ marginTop: 40 }}>
            <h2 id={`r-${region}`} style={{ fontSize: "1.6rem" }}>{region}</h2>
            <ul className="country-list">
              {list.map((c) => (
                <li key={c.code}>
                  <Link href={`/payouts/${c.slug}`}>{c.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="muted" style={{ marginTop: 40 }}>
        Not listed? International sanctions law currently prevents payouts to Cuba, Iran, North Korea and Syria.
      </p>
    </div>
  );
}
