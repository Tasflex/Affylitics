"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { allCountries, feeText, KIND_LABEL } from "@/lib/rails";

/** Pick a country, see how affiliates there withdraw. Computes the list client-side rather than
 *  taking it as props, which would serialize every country into the page. */
export function RailFinder({ initial = "KE" }: { initial?: string }) {
  const id = useId();
  const countries = useMemo(() => allCountries(), []);
  const [code, setCode] = useState(initial);
  const country = useMemo(() => countries.find((c) => c.code === code) ?? countries[0], [code, countries]);

  return (
    <section className="finder" aria-labelledby={`${id}-label`}>
      <header>
        <label htmlFor={`${id}-country`} id={`${id}-label`}>Select your country</label>
        <select id={`${id}-country`} className="input" value={code} onChange={(e) => setCode(e.target.value)}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </header>
      <ul className="rail-grid" aria-live="polite" aria-label={`Payout options in ${country.name}`}>
        {country.rails.map((r) => (
          <li key={r.id} className="rail">
            <span className="rail-kind">{KIND_LABEL[r.kind] ?? r.kind}</span>
            <span className="rail-name">{r.name}</span>
            <span className="rail-min">From ${r.min_usd}</span>
            <span className="rail-meta">{feeText(r)} · {r.speed}</span>
          </li>
        ))}
      </ul>
      <footer>
        <span className="muted">Paid in <strong>{country.currency}</strong></span>
        <Link href={`/payouts/${country.slug}`}>Full payout guide for {country.name}</Link>
      </footer>
    </section>
  );
}
