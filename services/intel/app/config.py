"""Settings from the environment. Every provider is optional: a provider without credentials is
simply not offered, so payouts for it stay queued instead of failing."""

import os
from pathlib import Path


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


ENV = _env("APP_ENV", "development")
INTERNAL_TOKEN = _env("INTERNAL_TOKEN")
API_URL = _env("API_URL", "http://127.0.0.1:8100")
PUBLIC_ORIGIN = _env("PUBLIC_ORIGIN", "http://localhost:3100")
# Public URL where providers send webhooks (nginx routes /hooks/* to this service).
WEBHOOK_BASE = _env("WEBHOOK_BASE", PUBLIC_ORIGIN + "/hooks")
RAILS_PATH = Path(_env("RAILS_PATH", str(Path(__file__).resolve().parents[3] / "packages/shared/rails.json")))

# KYC
SMILEID_PARTNER_ID = _env("SMILEID_PARTNER_ID")
SMILEID_API_KEY = _env("SMILEID_API_KEY")
SMILEID_BASE = _env("SMILEID_BASE", "https://testapi.smileidentity.com")
SUMSUB_APP_TOKEN = _env("SUMSUB_APP_TOKEN")
SUMSUB_SECRET_KEY = _env("SUMSUB_SECRET_KEY")
SUMSUB_WEBHOOK_SECRET = _env("SUMSUB_WEBHOOK_SECRET")
SUMSUB_LEVELS = {1: _env("SUMSUB_LEVEL_1", "basic-kyc"), 2: _env("SUMSUB_LEVEL_2", "id-and-liveness"), 3: _env("SUMSUB_LEVEL_3", "kyb")}
# Only for local development: approves KYC without a provider. Refused when APP_ENV=production.
KYC_SIMULATE = _env("KYC_SIMULATE") == "1" and ENV != "production"

# Payments in (advertiser escrow) and out (publisher payouts)
FLW_SECRET_KEY = _env("FLW_SECRET_KEY")
FLW_WEBHOOK_HASH = _env("FLW_WEBHOOK_HASH")
PAYSTACK_SECRET_KEY = _env("PAYSTACK_SECRET_KEY")
STRIPE_SECRET_KEY = _env("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = _env("STRIPE_WEBHOOK_SECRET")
MPESA_BASE = _env("MPESA_BASE", "https://sandbox.safaricom.co.ke")
MPESA_CONSUMER_KEY = _env("MPESA_CONSUMER_KEY")
MPESA_CONSUMER_SECRET = _env("MPESA_CONSUMER_SECRET")
MPESA_SHORTCODE = _env("MPESA_SHORTCODE")
MPESA_INITIATOR = _env("MPESA_INITIATOR")
MPESA_SECURITY_CREDENTIAL = _env("MPESA_SECURITY_CREDENTIAL")
# Daraja callbacks are unsigned, so the callback URL carries this secret path segment.
MPESA_CALLBACK_TOKEN = _env("MPESA_CALLBACK_TOKEN")
PAYPAL_BASE = _env("PAYPAL_BASE", "https://api-m.sandbox.paypal.com")
PAYPAL_CLIENT_ID = _env("PAYPAL_CLIENT_ID")
PAYPAL_SECRET = _env("PAYPAL_SECRET")
PAYPAL_WEBHOOK_ID = _env("PAYPAL_WEBHOOK_ID")

FX_URL = _env("FX_URL", "https://open.er-api.com/v6/latest/USD")
