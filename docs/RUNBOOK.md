# Runbook

## Where things run

VPS `185.187.169.13` (shared with theloadcalc, which lives in `/var/www/theloadcalc` on port 3000
and must not be touched).

| Process (PM2) | What | Port |
|---|---|---|
| `affylitics-web` | Next.js | 127.0.0.1:3100 |
| `affylitics-api` | Rust API | 127.0.0.1:8100 |
| `affylitics-intel` | FastAPI | 127.0.0.1:8200 |
| `affylitics-worker` | payouts + fraud scoring loop | — |

Code: `/var/www/affylitics`. Secrets: `/var/www/affylitics/.env` (mode 600). Database: Aiven.

## Deploy

```bash
ssh root@185.187.169.13
/var/www/affylitics/deploy/deploy.sh
```

Builds happen on the server. Migrations in `db/migrations` run automatically when the API starts;
add new files as `0002_name.sql` and never edit an applied one.

## First-time setup

1. `bash deploy/server-setup.sh`
2. Fill `.env` (see `.env.example`). Generate `DATA_KEY` with `openssl rand -base64 32` and store a
   copy in a password manager: without it, saved payout details cannot be decrypted.
3. Cloudflare: add DNS `network` → VPS IP (proxied). Create an Origin Certificate, save it to
   `/etc/ssl/affylitics/origin.pem` and `.key`.
4. `ln -s /var/www/affylitics/deploy/nginx/affylitics.conf /etc/nginx/sites-enabled/affylitics`,
   `nginx -t && systemctl reload nginx`
5. `deploy/deploy.sh`

## Provider webhooks to register

| Provider | URL |
|---|---|
| Flutterwave | `https://network.affylitics.com/hooks/flutterwave` (set the secret hash = `FLW_WEBHOOK_HASH`) |
| Paystack | `https://network.affylitics.com/hooks/paystack` |
| PayPal | `https://network.affylitics.com/hooks/paypal` (copy the webhook ID to `PAYPAL_WEBHOOK_ID`) |
| Stripe | `https://network.affylitics.com/hooks/stripe` (event `checkout.session.completed`) |
| M-Pesa | set automatically per request: `/hooks/payouts/mpesa/<MPESA_CALLBACK_TOKEN>` |
| Smile ID | set per link: `/hooks/kyc/smileid` |
| Sumsub | `https://network.affylitics.com/hooks/kyc/sumsub` |

## Payout states and what to do

- `requested`: queued. Stays queued if its provider has no credentials yet, or the country is
  flagged `review` in rails.json (staff send those manually).
- `processing` with no `provider_ref` for more than 15 minutes: the worker crashed or the provider
  call timed out. **Check the provider dashboard before doing anything**: if the transfer exists,
  record it as paid; if not, record it as failed (refunds the balance). Never resend blindly.
- `processing` with a `provider_ref`: waiting for the provider's webhook.

```bash
# Record an outcome by hand (from the VPS)
curl -X POST http://127.0.0.1:8100/internal/payouts/<id>/result \
  -H "Authorization: Bearer $INTERNAL_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"paid","provider_ref":"<ref from provider>"}'
```

## Adding a country or rail

Edit `packages/shared/rails.json`, run `cargo test` and `pytest` (both check every referenced rail
exists), deploy. The per-country SEO page is generated automatically.
