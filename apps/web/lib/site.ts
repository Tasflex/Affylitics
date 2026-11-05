export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100").replace(/\/$/, "");
export const SITE_NAME = "NetAffil";
export const GTM_ID = "GTM-547L53LQ";
export const TAGLINE = "The global affiliate marketplace";
export const DESCRIPTION =
  "NetAffil connects brands with affiliates worldwide. Brands launch funded affiliate campaigns and reach new markets; affiliates promote great products, earn commissions and withdraw through payment methods that work in their country.";

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function payoutLabel(o: { model: string; payout_cents: number | null; payout_bps: number | null }): string {
  if (o.model === "cps" && o.payout_bps != null) return `${(o.payout_bps / 100).toFixed(o.payout_bps % 100 ? 2 : 0)}% per sale`;
  const per = o.model === "cpl" ? "per lead" : "per action";
  return `${formatUsd(o.payout_cents ?? 0)} ${per}`;
}

export const MODEL_LABEL: Record<string, string> = { cps: "CPS · per sale", cpa: "CPA · per action", cpl: "CPL · per lead" };
