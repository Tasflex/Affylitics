import type { MetadataRoute } from "next";
import { serverApi, type Offer } from "@/lib/api";
import { allCountries } from "@/lib/rails";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const fixed = ["", "/offers", "/publishers", "/advertisers", "/payouts", "/signup", "/legal/terms", "/legal/privacy", "/accessibility"];
  const offers = (await serverApi<Offer[]>("/api/offers", { revalidate: 3600 })).data ?? [];
  return [
    ...fixed.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...allCountries().map((c) => ({ url: `${SITE_URL}/payouts/${c.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...offers.map((o) => ({ url: `${SITE_URL}/offers/${o.slug}`, lastModified: new Date(o.created_at), changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
