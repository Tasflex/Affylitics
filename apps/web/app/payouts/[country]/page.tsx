import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { allCountries, countryBySlug, feeText, KIND_LABEL, lowestMinimum } from "@/lib/rails";
import { regionAnchor } from "@/components/Marketing";
import { breadcrumbs, faqPage, pageMeta } from "@/lib/seo";

type Props = { params: Promise<{ country: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return allCountries().map((c) => ({ country: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = countryBySlug((await params).country);
  if (!c) return {};
  const names = c.rails.slice(0, 3).map((r) => r.name).join(", ");
  return pageMeta({
    title: `Affiliate payouts in ${c.name}: ${names}`,
    description: `Join an affiliate network that pays in ${c.name}. Withdraw your commissions by ${names} from $${lowestMinimum(c)}, paid in ${c.currency}.`,
    path: `/payouts/${c.slug}`,
  });
}

export default async function CountryPayouts({ params }: Props) {
  const c = countryBySlug((await params).country);
  if (!c) notFound();
  const first = c.rails[0];
  const neighbours = allCountries().filter((n) => n.region === c.region && n.code !== c.code);
  const faq = [
    {
      q: `Can I join NetAffil from ${c.name}?`,
      a: `Yes. Publishers in ${c.name} can sign up, promote offers and earn without any country restriction.`,
    },
    {
      q: `What is the minimum payout in ${c.name}?`,
      a: `You can withdraw from $${lowestMinimum(c)} using ${c.rails.find((r) => r.min_usd === lowestMinimum(c))?.name}.`,
    },
    {
      q: `What do I need to withdraw in ${c.name}?`,
      a: `A verified identity (a one-time check with a government ID) and a payout method such as ${first.name}.`,
    },
  ];

  return (
    <div className="container section">
      <nav aria-label="Breadcrumb" className="muted" style={{ fontSize: ".92rem", marginBottom: 16 }}>
        <Link href="/payouts">Payouts</Link> <span aria-hidden="true">/</span>{" "}
        <Link href={`/payouts#${regionAnchor(c.region)}`}>{c.region}</Link> <span aria-hidden="true">/</span>{" "}
        <span aria-current="page">{c.name}</span>
      </nav>
      <p className="eyebrow">{c.region}</p>
      <h1>Affiliate payouts in {c.name}</h1>
      <p className="lede">
        Earn commissions promoting funded offers and withdraw to {c.rails.map((r) => r.name).slice(0, 3).join(", ")}
        {c.rails.length > 3 ? " and more" : ""}. Balances are held in US dollars and paid out in {c.currency}
        {c.currency === "USD" ? "" : " at the day's exchange rate"}.
      </p>
      {c.review && (
        <div className="alert info" role="note">
          Payouts to {c.name} are sent after a short manual compliance review, usually within two business days.
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 24 }}>
        <table>
          <caption className="sr-only">Payout methods available in {c.name}</caption>
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Type</th>
              <th scope="col" className="num">Minimum</th>
              <th scope="col">Fee</th>
              <th scope="col">Speed</th>
            </tr>
          </thead>
          <tbody>
            {c.rails.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th>
                <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
                <td className="num">${r.min_usd}</td>
                <td>{feeText(r)}</td>
                <td>{r.speed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 32 }}>
        <Link href="/signup" className="btn">Join from {c.name}</Link>
        <Link href="/offers" className="btn ghost">Browse offers</Link>
      </div>

      <section className="faq prose" style={{ marginTop: 48 }} aria-labelledby="cfaq">
        <h2 id="cfaq">Common questions in {c.name}</h2>
        {faq.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      {neighbours.length > 0 && (
        <section style={{ marginTop: 48 }} aria-labelledby="nearby">
          <h2 id="nearby" style={{ fontSize: "1.6rem" }}>Affiliate payouts elsewhere in {c.region}</h2>
          <ul className="country-list">
            {neighbours.map((n) => (
              <li key={n.code}><Link href={`/payouts/${n.slug}`}>{n.name}</Link></li>
            ))}
          </ul>
        </section>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            breadcrumbs([{ name: "Payouts", path: "/payouts" }, { name: c.name, path: `/payouts/${c.slug}` }]),
            faqPage(faq),
          ],
        }}
      />
    </div>
  );
}
