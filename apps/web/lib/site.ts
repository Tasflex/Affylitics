export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100").replace(/\/$/, "");
export const SITE_NAME = "Affylitics";
export const TAGLINE = "The affiliate network that pays you where you live";
export const DESCRIPTION =
  "Join Affylitics from any country, promote funded offers and get paid by M-Pesa, mobile money, UPI, PIX, bank transfer, PayPal or USDC. Low minimums, transparent ledger, no country gatekeeping.";

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function payoutLabel(o: { model: string; payout_cents: number | null; payout_bps: number | null }): string {
  if (o.model === "cps" && o.payout_bps != null) return `${(o.payout_bps / 100).toFixed(o.payout_bps % 100 ? 2 : 0)}% per sale`;
  const per = o.model === "cpl" ? "per lead" : "per action";
  return `${formatUsd(o.payout_cents ?? 0)} ${per}`;
}
