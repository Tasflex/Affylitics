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
| Flutterwave | `https://netaffil.com/hooks/flutterwave` (set the secret hash = `FLW_WEBHOOK_HASH`) |
| Paystack | `https://netaffil.com/hooks/paystack` |
| PayPal | `https://netaffil.com/hooks/paypal` (copy the webhook ID to `PAYPAL_WEBHOOK_ID`) |
| Stripe | `https://netaffil.com/hooks/stripe` (event `checkout.session.completed`) |
| M-Pesa | set automatically per request: `/hooks/payouts/mpesa/<MPESA_CALLBACK_TOKEN>` |
| Smile ID | set per link: `/hooks/kyc/smileid` |
| Sumsub | `https://netaffil.com/hooks/kyc/sumsub` |

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

## Verify a deploy

`bash deploy/e2e-test.sh` runs the full money flow (signup, click, signed postback, escrow,
ledger invariants, KYC gate, payout) against a throwaway `affylitics_e2e` database on the same
Aiven server and drops it afterwards. Needs `postgresql-client`.

## Sign in with Google

1. Google Cloud Console → APIs & Services → OAuth consent screen: app name NetAffil, support
   email, authorized domain `netaffil.com`, scopes `openid`, `email`, `profile`. Publish it.
2. Credentials → Create credentials → OAuth client ID → Web application.
   - Authorized JavaScript origin: `https://netaffil.com`
   - Authorized redirect URI: `https://netaffil.com/api/auth/google/callback`
3. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, then
   `pm2 restart affylitics-api affylitics-web --update-env` (no rebuild needed). The "Continue with
   Google" button appears once both are set.

Accounts are matched by Google account ID, then by verified email, so an existing email/password
user who signs in with Google with the same address keeps the same account.

## Admin console

`https://netaffil.com/admin` is visible only to accounts with `is_admin` (everyone else gets a 404).
Grant or revoke access on the VPS:

```bash
bash /var/www/affylitics/deploy/make-admin.sh someone@example.com            # grant
bash /var/www/affylitics/deploy/make-admin.sh someone@example.com --revoke   # revoke
```

Every staff action needs a written reason and is recorded in the audit log. Use **Escrow credit**
for brands who pay by bank transfer, only after the money is visible in the company account.
