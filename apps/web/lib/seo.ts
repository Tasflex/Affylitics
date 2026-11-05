import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "./site";

/** Title, description, canonical and matching social tags for a public page. Without this, pages
 *  inherit the root layout's Open Graph block and every share card shows the home page. */
export function pageMeta({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: SITE_NAME, url: `${SITE_URL}${path}`, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

type Crumb = { name: string; path: string };

export function breadcrumbs(items: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_URL}${c.path}` })),
  };
}

export function faqPage(faq: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
