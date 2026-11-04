# Affylitics Network — Architecture

Affylitics is an affiliate network built for the people the big networks turn away. If you can
legally receive money in your country, you can join, earn and get paid in a rail that actually
works where you live: M-Pesa in Kenya, bank or mobile money through Flutterwave and Paystack in
West Africa, UPI in India, PIX in Brazil, SEPA in Europe, ACH in the US, USDC anywhere it is lawful.

## What makes it different

1. **No country gatekeeping.** Sign-up is open in every country. The only hard block is the legal
   one: comprehensively sanctioned jurisdictions and sanctioned persons (OFAC/UN/EU/UK lists).
   That is a law we must follow, not a business preference.
2. **Funded offers (escrow-first).** Advertisers pre-fund an escrow balance. A conversion moves
   money from the advertiser's escrow into the publisher's pending balance in the same database
   transaction that records it. Publishers never chase an advertiser who disappears — the money
   was set aside before the click.
3. **Earn before you verify.** Progressive KYC: a new publisher can create links and accrue
   earnings at Tier 0. Identity checks are only needed at the moment of the first payout, and the
   check uses an ID that exists locally (Smile ID for Africa's national IDs, Sumsub elsewhere).
4. **Local rails, low minimums.** Mobile money payouts start at $2, not $100. The rail registry
   (`packages/shared/rails.json`) is the single source for which rails each country gets, their
   minimums, fees and speed. Web pages, the API and the payout worker all read it.
5. **Transparent ledger.** Every cent moves through a double-entry ledger enforced by a database
   constraint trigger. Publishers can see each entry behind their balance.

## Services

```
                 Cloudflare (TLS, WAF, caching of public pages)
                              │
                           nginx (VPS)
              ┌───────────────┼────────────────────┐
         /  (pages)      /api/* , /go/*        (nothing public)
              │               │
   apps/web  Next.js     services/api  Rust (axum)         services/intel  Python (FastAPI)
   port 3100             port 8100                         port 8200, localhost only
   SSR/SSG pages,        auth, offers, links,              fraud scoring, FX rates,
   SEO, dashboard UI     click redirect, postbacks,        payout worker + provider adapters,
                         ledger, payouts, KYC state        KYC provider adapters/webhooks
                              │                                 │
                              └──────── PostgreSQL 16 ──────────┘
                                        Redis (rate limits, FX cache)
```

| Concern | Owner | Why there |
|---|---|---|
| Click redirect `/go/{code}` | Rust | Hot path; must answer in a few ms under load |
| Ledger writes | Rust only | One writer keeps the money invariants in one place |
| Payout execution | Python worker → Rust internal API | Provider SDKs and HTTP clients are richest in Python; the worker never writes the ledger itself, it reports results to Rust |
| Fraud scoring | Python | Heuristics now, a model later; scores are written back on clicks/conversions |
| Pages, SEO, a11y | Next.js | SSG for marketing and the 200+ per-country payout pages, SSR for dashboard |

The browser only ever talks to one origin. Next.js rewrites `/api/*` and `/go/*` to the Rust API,
so the session cookie is first-party, `SameSite=Lax`, `HttpOnly`, `Secure`.

## Money model

All ledger amounts are integer **USD cents** (`bigint`). Payouts convert to the local currency at
payout time using the intel service's FX quote, and the quote is stored on the payout row.

Accounts per user: `advertiser_escrow`, `publisher_pending`, `publisher_available`,
`payout_clearing`. Platform accounts: `platform_revenue`, `external` (money entering/leaving).

| Event | Debit (−) | Credit (+) |
|---|---|---|
| Advertiser funds $100 | external −100 | advertiser_escrow +100 |
| Conversion, commission $10, platform fee 20% | escrow −12 | publisher_pending +10, platform_revenue +2 |
| Hold period ends (default 30 days) | publisher_pending −10 | publisher_available +10 |
| Conversion rejected while pending | publisher_pending −10, platform_revenue −2 | escrow +12 |
| Payout requested $10 | publisher_available −10 | payout_clearing +10 |
| Payout sent | payout_clearing −10 | external +10 |
| Payout failed | payout_clearing −10 | publisher_available +10 |

A deferred constraint trigger rejects any transaction whose entries do not sum to zero. Balances
are never stored, only derived, so they cannot drift. A balance check prevents escrow and
`publisher_available` going negative.

## KYC tiers

| Tier | Needs | Unlocks |
|---|---|---|
| 0 | Verified email | Links, tracking, earning |
| 1 | Legal name, date of birth, national ID number checked against the issuing registry (Smile ID / Sumsub), sanctions screen | Payouts up to $1,000 / 30 days |
| 2 | ID document + selfie liveness | Payouts up to $25,000 / 30 days |
| 3 | Business verification (KYB) | Advertiser escrow funding above $10,000, publisher above Tier 2 |

Provider selection is by country: Smile ID covers African national IDs (NIN, Ghana Card, Kenyan
ID, SA ID, …); Sumsub covers the rest. Both report back by signed webhook to the intel service,
which updates `kyc_checks` and the user's tier through the Rust internal API.

## Payout rails

`packages/shared/rails.json` maps every country to its rails. Each rail names the provider that
executes it:

- **Flutterwave**: mobile money and bank across ~30 African countries
- **Paystack**: NG, GH, ZA, KE bank transfers
- **M-Pesa Daraja B2C**: direct to Kenyan M-Pesa wallets (cheapest path for Kenya)
- **dLocal**: LatAm and emerging Asia (PIX, SPEI, Nequi, UPI, GCash, bKash, …)
- **Wise**: bank payouts in ~70 currencies
- **PayPal Payouts**, **Payoneer**: universal fallbacks
- **Stripe Connect**: US/EU/UK/AU/CA and other supported countries
- **Circle USDC**: global fallback where stablecoin payouts are lawful

Every country falls back to PayPal, Payoneer and USDC (where lawful) so no country has zero rails.

## Security

- Passwords: Argon2id (m=19 MiB, t=2, p=1), never logged.
- Sessions: 256-bit random token in an `HttpOnly; Secure; SameSite=Lax` cookie; only its SHA-256
  is stored. 30-day expiry, revoked on logout and password change.
- CSRF: state-changing requests need `SameSite` cookie plus an `Origin` check against
  `PUBLIC_ORIGIN`.
- Payout details (phone numbers, bank accounts) are encrypted at rest with AES-256-GCM using a key
  from the environment, never returned in full to the client (last 4 only).
- Advertiser postbacks are signed with HMAC-SHA256 per brand and rejected outside a 5-minute
  window (replay protection).
- Internal service calls carry a shared `INTERNAL_TOKEN` and only bind to localhost.
- Rate limits per IP on auth, link creation and postbacks.
- Every money or permission change writes `audit_log`.
- Payout requests take an idempotency key; duplicate submissions return the original payout.
- IPs are stored as salted hashes, not raw.

## Accessibility and SEO

- WCAG 2.2 AA: semantic landmarks, skip link, visible focus rings, 4.5:1 contrast tokens, every
  form field labelled, errors announced via `aria-live`, reduced-motion respected, no
  colour-only meaning.
- SEO: static per-country payout pages (`/payouts/kenya`), offer pages, FAQ and Organization
  JSON-LD, canonical URLs, sitemap and robots generated from data, OpenGraph images.

## Repository layout

```
apps/web/              Next.js site and dashboard
services/api/          Rust API (axum + sqlx)
services/intel/        Python FastAPI + payout worker
packages/shared/       rails.json and country data shared by all three
db/migrations/         SQL migrations (applied by the API on start)
deploy/                nginx, PM2 ecosystem, server setup script
docs/                  this file and the runbook
```
