import registry from "./generated/rails.json";

export type Rail = {
  id: string;
  name: string;
  kind: string;
  provider: string;
  min_usd: number;
  fee_pct: number;
  fee_usd: number;
  speed: string;
};

export type CountryRails = { code: string; name: string; slug: string; region: string; currency: string; review: boolean; rails: Rail[] };

type Registry = {
  blocked: string[];
  rails: Record<string, Omit<Rail, "id">>;
  default: { rails: string[] };
  regions: Record<string, string[]>;
  countries: Record<string, { currency: string; rails: string[]; review?: boolean }>;
  sepa: string[];
};

const reg = registry as Registry;

const SEPA_CURRENCY: Record<string, string> = {
  PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", SE: "SEK", DK: "DKK", NO: "NOK", IS: "ISK", CH: "CHF",
};

const names = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string): string {
  if (code === "XK") return "Kosovo";
  return names.of(code) ?? code;
}

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const REGION_NAMES = Object.keys(reg.regions);

function regionOf(code: string): string {
  return REGION_NAMES.find((r) => reg.regions[r].includes(code)) ?? "Other";
}

export function isBlocked(code: string): boolean {
  return reg.blocked.includes(code);
}

export function railsFor(code: string): CountryRails | null {
  if (isBlocked(code)) return null;
  let currency = "USD";
  let ids = reg.default.rails;
  let review = false;
  const entry = reg.countries[code];
  if (entry) {
    currency = entry.currency;
    ids = entry.rails;
    review = !!entry.review;
  } else if (reg.sepa.includes(code)) {
    currency = SEPA_CURRENCY[code] ?? "EUR";
    ids = ["sepa", "paypal", "payoneer", "usdc"];
  }
  const name = countryName(code);
  return {
    code,
    name,
    slug: slugify(name),
    region: regionOf(code),
    currency,
    review,
    rails: ids.filter((id) => reg.rails[id]).map((id) => ({ id, ...reg.rails[id] })),
  };
}

/** Every country we can pay, sorted by name. */
export function allCountries(): CountryRails[] {
  const codes = new Set(Object.values(reg.regions).flat());
  return [...codes]
    .map(railsFor)
    .filter((c): c is CountryRails => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function countryBySlug(slug: string): CountryRails | undefined {
  return allCountries().find((c) => c.slug === slug);
}

export const KIND_LABEL: Record<string, string> = {
  mobile_money: "Mobile money",
  instant_bank: "Instant bank",
  bank: "Bank transfer",
  wallet: "Digital wallet",
  stablecoin: "Stablecoin",
};

export function feeText(r: Rail): string {
  const parts = [];
  if (r.fee_pct) parts.push(`${r.fee_pct}%`);
  if (r.fee_usd) parts.push(`$${r.fee_usd.toFixed(2)}`);
  return parts.length ? `${parts.join(" + ")} fee` : "No fee";
}

export function lowestMinimum(c: CountryRails): number {
  return Math.min(...c.rails.map((r) => r.min_usd));
}
