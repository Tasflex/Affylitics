import Link from "next/link";
import { categoryIcon } from "./Icons";
import { countryName } from "@/lib/rails";
import { MODEL_LABEL } from "@/lib/site";

export type OfferCardData = {
  slug?: string;
  title: string;
  brand: string;
  category: string;
  model: string;
  payout_cents: number | null;
  payout_bps: number | null;
  cookie_days?: number;
  allowed_countries?: string[] | null;
  funded?: boolean;
  brand_verified?: boolean;
  example?: boolean;
};

function rate(o: OfferCardData) {
  if (o.model === "cps" && o.payout_bps != null) return { big: `${+(o.payout_bps / 100).toFixed(2)}%`, unit: "per sale" };
  return { big: `$${((o.payout_cents ?? 0) / 100).toFixed((o.payout_cents ?? 0) % 100 ? 2 : 0)}`, unit: o.model === "cpl" ? "per lead" : "per action" };
}

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function OfferCard({ o }: { o: OfferCardData }) {
  const Art = categoryIcon(o.category);
  const r = rate(o);
  const markets = o.allowed_countries?.length
    ? o.allowed_countries.length > 2 ? `${o.allowed_countries.length} markets` : o.allowed_countries.map(countryName).join(", ")
    : "Global";
  return (
    <li className="offer-card">
      <div className={`offer-art art-${hash(o.category) % 6}`}>
        <span className="tag">
          {o.example ? <span className="pill">Example offer</span> : o.funded ? <span className="pill green">Funded</span> : null}
        </span>
        <Art />
      </div>
      <div className="offer-body">
        <span className="muted" style={{ fontSize: ".85rem", fontWeight: 700 }}>{o.category.charAt(0).toUpperCase() + o.category.slice(1)}</span>
        <h3>{o.slug ? <Link href={`/offers/${o.slug}`}>{o.title}</Link> : o.title}</h3>
        <span className="muted" style={{ fontSize: ".9rem" }}>by {o.brand}{o.brand_verified ? " ✓" : ""}</span>
        <div className="offer-rate">{r.big}<small>{r.unit}</small></div>
        <div className="offer-meta">
          <span className="pill">{MODEL_LABEL[o.model] ?? o.model.toUpperCase()}</span>
          <span className="pill">{markets}</span>
          {o.cookie_days ? <span className="pill">{o.cookie_days}-day cookie</span> : null}
        </div>
      </div>
    </li>
  );
}

/** Shown alongside live offers while the marketplace is filling up. Clearly labelled as examples. */
export const EXAMPLE_OFFERS: OfferCardData[] = [
  { title: "Clinical skincare starter kit", brand: "Example beauty brand", category: "Beauty & skincare", model: "cps", payout_cents: null, payout_bps: 1500, cookie_days: 30, example: true },
  { title: "Analytics dashboard for small teams", brand: "Example SaaS company", category: "Software & SaaS", model: "cps", payout_bps: 3000, payout_cents: null, cookie_days: 60, example: true },
  { title: "Everyday sneakers collection", brand: "Example fashion label", category: "Fashion & lifestyle", model: "cps", payout_bps: 1200, payout_cents: null, cookie_days: 30, example: true },
  { title: "AI study skills course", brand: "Example education platform", category: "Education", model: "cps", payout_bps: 2000, payout_cents: null, cookie_days: 45, example: true },
];
