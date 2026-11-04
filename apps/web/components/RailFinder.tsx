"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { allCountries, feeText, KIND_LABEL } from "@/lib/rails";

/** Pick a country, see exactly how you would be paid there. The home page's signature element.
 *  Computes the list itself rather than taking it as props, which would serialize it into the page. */
export function RailFinder({ initial = "KE" }: { initial?: string }) {
  const id = useId();
  const countries = useMemo(() => allCountries(), []);
  const [code, setCode] = useState(initial);
  const country = useMemo(() => countries.find((c) => c.code === code) ?? countries[0], [code, countries]);

  return (
    <section className="finder" aria-labelledby={`${id}-title`}>
      <header>
        <label htmlFor={`${id}-country`} id={`${id}-title`}>How you get paid in</label>
        <select id={`${id}-country`} className="input" value={code} onChange={(e) => setCode(e.target.value)}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </header>
      <ul aria-live="polite">
        {country.rails.map((r) => (
          <li key={r.id}>
            <span className="rail-name">{r.name}</span>
            <span className="rail-min">from ${r.min_usd}</span>
            <span className="rail-meta">{KIND_LABEL[r.kind] ?? r.kind} · {r.speed}</span>
            <span className="rail-meta" style={{ textAlign: "right" }}>{feeText(r)}</span>
          </li>
        ))}
      </ul>
      <footer>
        Paid in {country.currency}.{" "}
        <Link href={`/payouts/${country.slug}`}>Full guide for {country.name}</Link>
      </footer>
    </section>
  );
}
