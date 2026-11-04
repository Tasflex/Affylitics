import { cookies } from "next/headers";

const API = process.env.API_INTERNAL_URL || "http://127.0.0.1:8100";

/** Server-side fetch to the Rust API, forwarding the visitor's session cookie. */
export async function serverApi<T>(path: string, init?: { revalidate?: number; auth?: boolean }): Promise<{ ok: boolean; status: number; data: T | null }> {
  const headers: Record<string, string> = {};
  if (init?.auth) {
    const session = (await cookies()).get("aff_session");
    if (session) headers.cookie = `aff_session=${session.value}`;
  }
  try {
    const res = await fetch(API + path, {
      headers,
      ...(init?.auth ? { cache: "no-store" as const } : { next: { revalidate: init?.revalidate ?? 300 } }),
    });
    const data = res.ok ? ((await res.json()) as T) : null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 503, data: null };
  }
}

export type Me = {
  id: string;
  email: string;
  role: "publisher" | "advertiser" | "admin";
  display_name: string;
  country: string;
  kyc_tier: number;
  email_verified: boolean;
  balances: { escrow_cents: number; pending_cents: number; available_cents: number; in_payout_cents: number };
};

export type Offer = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  brand: string;
  brand_verified: boolean;
  model: string;
  payout_cents: number | null;
  payout_bps: number | null;
  cookie_days: number;
  hold_days: number;
  allowed_countries: string[] | null;
  funded: boolean;
  created_at: string;
};
