import Link from "next/link";
import { Icon } from "./Icons";
import { lowestMinimum, railsFor, slugify } from "@/lib/rails";

/** Where affiliates can promote offers. Shared by the home and publisher pages. */
const CHANNELS = [
  { icon: Icon.receipt, title: "Blogs & SEO sites", text: "Reviews, comparisons and how-to guides that rank in search and convert readers who are ready to buy." },
  { icon: Icon.chart, title: "YouTube, TikTok & Reels", text: "Unboxings, tutorials and short videos, with your link in the description, bio or pinned comment." },
  { icon: Icon.users, title: "WhatsApp & Telegram", text: "Channels and community groups where people already trust your recommendations." },
  { icon: Icon.bag, title: "Coupon & deal sites", text: "Deal round-ups and discount pages for shoppers comparing prices before they check out." },
  { icon: Icon.megaphone, title: "Newsletters & email", text: "Curated picks for subscribers who opened your email because they value your taste." },
  { icon: Icon.globe, title: "Instagram, X & Facebook", text: "Posts, stories and pages: share links where the offer's rules allow social promotion." },
];

export function PromoteChannels() {
  return (
    <ul className="channel-grid">
      {CHANNELS.map((c) => (
        <li key={c.title} className="channel">
          <span className="icon-tile"><c.icon /></span>
          <h3>{c.title}</h3>
          <p>{c.text}</p>
        </li>
      ))}
    </ul>
  );
}

// Countries with large affiliate audiences, linked from the front pages so search engines find
// the country payout pages and visitors can jump straight to theirs.
const POPULAR = ["KE", "NG", "GH", "ZA", "UG", "TZ", "EG", "IN", "PK", "PH", "ID", "BD", "BR", "MX", "CO", "US", "GB", "DE", "CA", "AE"];

export function PopularCountries({ limit = POPULAR.length }: { limit?: number }) {
  const list = POPULAR.map(railsFor).filter((c) => c !== null).slice(0, limit);
  return (
    <ul className="country-chips">
      {list.map((c) => (
        <li key={c.code}>
          <Link href={`/payouts/${c.slug}`} className="country-chip">
            <strong>{c.name}</strong>
            <span>{c.rails[0].name} · from ${lowestMinimum(c)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function regionAnchor(region: string): string {
  return `region-${slugify(region)}`;
}
