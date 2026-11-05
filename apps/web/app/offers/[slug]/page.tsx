import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GetLinkButton } from "@/components/GetLinkButton";
import { serverApi, type Offer } from "@/lib/api";
import { countryName } from "@/lib/rails";
import { payoutLabel } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 300;

async function load(slug: string) {
  return (await serverApi<Offer>(`/api/offers/${encodeURIComponent(slug)}`, { revalidate: 300 })).data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = await load((await params).slug);
  if (!o) return { title: "Offer not found", robots: { index: false } };
  return pageMeta({
    title: `${o.title} affiliate program: ${payoutLabel(o)}`,
    description: `Promote ${o.title} by ${o.brand} and earn ${payoutLabel(o)}. Open to publishers in every country.`,
    path: `/offers/${o.slug}`,
  });
}

export default async function OfferPage({ params }: Props) {
  const o = await load((await params).slug);
  if (!o) notFound();
  return (
    <div className="container section">
      <nav aria-label="Breadcrumb" className="muted" style={{ fontSize: ".92rem", marginBottom: 16 }}>
        <Link href="/offers">Offers</Link> <span aria-hidden="true">/</span> <span aria-current="page">{o.title}</span>
      </nav>
      <div className="row"><span className="pill">{o.category}</span>{o.funded && <span className="pill green">Funded</span>}</div>
      <h1 style={{ marginTop: 12 }}>{o.title}</h1>
      <p className="lede">by {o.brand}</p>

      <div className="grid cols-4" style={{ margin: "28px 0" }}>
        <div className="card stat"><div className="label">You earn</div><div className="value">{payoutLabel(o)}</div></div>
        <div className="card stat"><div className="label">Cookie window</div><div className="value">{o.cookie_days} days</div></div>
        <div className="card stat"><div className="label">Hold period</div><div className="value">{o.hold_days} days</div></div>
        <div className="card stat">
          <div className="label">Buyers from</div>
          <div className="value" style={{ fontSize: "1.2rem" }}>
            {o.allowed_countries?.length ? o.allowed_countries.map(countryName).join(", ") : "Anywhere"}
          </div>
        </div>
      </div>

      <div className="prose" style={{ whiteSpace: "pre-line" }}>{o.description || "The advertiser has not added a description yet."}</div>
      <div style={{ marginTop: 32 }}>
        <GetLinkButton slug={o.slug} />
      </div>
    </div>
  );
}
