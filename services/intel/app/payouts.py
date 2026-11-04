"""Payout provider adapters. Each `send` submits a transfer and returns the provider's reference;
the final paid/failed outcome arrives later by webhook. Our payout id is always the transfer
reference, so webhooks map straight back without a lookup table.

Raise `Rejected` only when the provider definitively refused the transfer (no money moved).
Any other exception leaves the payout in `processing` for reconciliation, because retrying an
ambiguous failure could pay someone twice."""

import base64
import hashlib
import hmac
import time

import httpx

from . import config


class Rejected(Exception):
    pass


ZERO_DECIMAL = {"KES", "UGX", "RWF", "TZS", "XOF", "XAF", "MWK", "IDR", "VND", "JPY", "CLP", "PYG", "KRW"}


def local_amount_str(amount: float, currency: str) -> str:
    return str(int(round(amount))) if currency in ZERO_DECIMAL else f"{amount:.2f}"


def _detail(p: dict, key: str) -> str:
    value = (p.get("details") or {}).get(key, "").strip()
    if not value:
        raise Rejected(f"payout method is missing {key.replace('_', ' ')}")
    return value


# ── Flutterwave: African mobile money and bank ─────────────────────────────

# Flutterwave "account_bank" codes for mobile money, by (rail, country). Confirm per country in
# Flutterwave's dashboard before enabling a new corridor.
FLW_MOBILE = {
    ("mpesa", "KE"): "MPS", ("airtel_money", "KE"): "ATL",
    ("mtn_momo", "GH"): "MTN", ("airtel_money", "GH"): "ATL",
    ("mtn_momo", "UG"): "MPS", ("airtel_money", "UG"): "AIRTEL",
    ("mpesa_tz", "TZ"): "MPS", ("airtel_money", "TZ"): "AIRTEL",
    ("mtn_momo", "RW"): "MPS", ("airtel_money", "RW"): "AIRTEL",
    ("mtn_momo", "ZM"): "MPS", ("airtel_money", "ZM"): "AIRTEL",
    ("mtn_momo", "CM"): "FMM", ("orange_money", "CM"): "FMM",
    ("mtn_momo", "CI"): "FMM", ("orange_money", "CI"): "FMM", ("wave", "CI"): "WAVE",
    ("orange_money", "SN"): "FMM", ("wave", "SN"): "WAVE",
    ("orange_money", "BF"): "FMM", ("orange_money", "ML"): "FMM", ("mtn_momo", "BJ"): "FMM",
}


async def flutterwave_send(p: dict, amount: float, currency: str) -> str:
    if p["rail"] == "africa_bank":
        account_bank, account_number = _detail(p, "bank_code"), _detail(p, "account_number")
    else:
        account_bank = FLW_MOBILE.get((p["rail"], p["country"]))
        if not account_bank:
            raise Rejected(f"{p['rail']} is not yet enabled for {p['country']}")
        account_number = _detail(p, "phone").lstrip("+")
    async with httpx.AsyncClient(timeout=30) as c:
        res = await c.post(
            "https://api.flutterwave.com/v3/transfers",
            headers={"Authorization": f"Bearer {config.FLW_SECRET_KEY}"},
            json={
                "account_bank": account_bank,
                "account_number": account_number,
                "amount": float(local_amount_str(amount, currency)),
                "currency": currency,
                "debit_currency": "USD",
                "beneficiary_name": p["display_name"],
                "narration": "Affylitics earnings",
                "reference": p["id"],
                "callback_url": f"{config.WEBHOOK_BASE}/payouts/flutterwave",
            },
        )
    body = res.json()
    if res.status_code >= 400 or body.get("status") != "success":
        raise Rejected(body.get("message") or f"Flutterwave returned {res.status_code}")
    return str(body["data"]["id"])


# ── Paystack: NG / GH / ZA / KE bank transfers ─────────────────────────────

PAYSTACK_TYPES = {"NGN": "nuban", "GHS": "ghipss", "ZAR": "basa", "KES": "kepss"}


async def paystack_send(p: dict, amount: float, currency: str) -> str:
    headers = {"Authorization": f"Bearer {config.PAYSTACK_SECRET_KEY}"}
    async with httpx.AsyncClient(base_url="https://api.paystack.co", timeout=30, headers=headers) as c:
        rec = await c.post("/transferrecipient", json={
            "type": PAYSTACK_TYPES.get(currency, "nuban"),
            "name": p["display_name"],
            "account_number": _detail(p, "account_number"),
            "bank_code": _detail(p, "bank_code"),
            "currency": currency,
        })
        rec_body = rec.json()
        if not rec_body.get("status"):
            raise Rejected(rec_body.get("message") or "Paystack could not add the recipient")
        res = await c.post("/transfer", json={
            "source": "balance",
            "amount": int(round(amount * 100)),  # subunits
            "recipient": rec_body["data"]["recipient_code"],
            "reference": p["id"],
            "reason": "Affylitics earnings",
            "currency": currency,
        })
    body = res.json()
    if not body.get("status"):
        raise Rejected(body.get("message") or "Paystack refused the transfer")
    return body["data"]["transfer_code"]


def paystack_signature_valid(raw: bytes, signature: str) -> bool:
    expected = hmac.new(config.PAYSTACK_SECRET_KEY.encode(), raw, hashlib.sha512).hexdigest()
    return bool(config.PAYSTACK_SECRET_KEY) and hmac.compare_digest(expected, signature or "")


# ── M-Pesa Daraja B2C: direct to Kenyan wallets ────────────────────────────

_mpesa_token: dict = {"value": "", "exp": 0.0}


async def _mpesa_auth(c: httpx.AsyncClient) -> str:
    if _mpesa_token["exp"] > time.time() + 60:
        return _mpesa_token["value"]
    basic = base64.b64encode(f"{config.MPESA_CONSUMER_KEY}:{config.MPESA_CONSUMER_SECRET}".encode()).decode()
    res = await c.get("/oauth/v1/generate?grant_type=client_credentials", headers={"Authorization": f"Basic {basic}"})
    res.raise_for_status()
    data = res.json()
    _mpesa_token.update(value=data["access_token"], exp=time.time() + int(data.get("expires_in", 3599)))
    return _mpesa_token["value"]


def kenyan_msisdn(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("0") and len(digits) == 10:
        digits = "254" + digits[1:]
    if not (digits.startswith("254") and len(digits) == 12):
        raise Rejected("enter a Kenyan M-Pesa number like 0712 345 678")
    return digits


async def mpesa_send(p: dict, amount: float, currency: str) -> str:
    if currency != "KES":
        raise Rejected("M-Pesa B2C pays in KES only")
    callback = f"{config.WEBHOOK_BASE}/payouts/mpesa/{config.MPESA_CALLBACK_TOKEN}"
    async with httpx.AsyncClient(base_url=config.MPESA_BASE, timeout=30) as c:
        token = await _mpesa_auth(c)
        res = await c.post("/mpesa/b2c/v3/paymentrequest", headers={"Authorization": f"Bearer {token}"}, json={
            "OriginatorConversationID": p["id"],
            "InitiatorName": config.MPESA_INITIATOR,
            "SecurityCredential": config.MPESA_SECURITY_CREDENTIAL,
            "CommandID": "BusinessPayment",
            "Amount": int(round(amount)),
            "PartyA": config.MPESA_SHORTCODE,
            "PartyB": kenyan_msisdn(_detail(p, "phone")),
            "Remarks": "Affylitics earnings",
            "QueueTimeOutURL": callback,
            "ResultURL": callback,
            "Occasion": "payout",
        })
    body = res.json()
    if body.get("ResponseCode") != "0":
        raise Rejected(body.get("errorMessage") or body.get("ResponseDescription") or "M-Pesa refused the request")
    return body.get("ConversationID", p["id"])


# ── PayPal Payouts: global fallback ────────────────────────────────────────

async def _paypal_token(c: httpx.AsyncClient) -> str:
    res = await c.post("/v1/oauth2/token", data={"grant_type": "client_credentials"},
                       auth=(config.PAYPAL_CLIENT_ID, config.PAYPAL_SECRET))
    res.raise_for_status()
    return res.json()["access_token"]


async def paypal_send(p: dict, amount: float, currency: str) -> str:
    # PayPal converts on the recipient side, so we always send USD.
    usd = (p["amount_cents"] - p["fee_cents"]) / 100
    async with httpx.AsyncClient(base_url=config.PAYPAL_BASE, timeout=30) as c:
        token = await _paypal_token(c)
        res = await c.post("/v1/payments/payouts", headers={"Authorization": f"Bearer {token}"}, json={
            "sender_batch_header": {"sender_batch_id": p["id"], "email_subject": "Your Affylitics earnings"},
            "items": [{
                "recipient_type": "EMAIL",
                "amount": {"value": f"{usd:.2f}", "currency": "USD"},
                "receiver": _detail(p, "email"),
                "sender_item_id": p["id"],
            }],
        })
    body = res.json()
    if res.status_code >= 400:
        raise Rejected(body.get("message") or f"PayPal returned {res.status_code}")
    return body["batch_header"]["payout_batch_id"]


async def paypal_webhook_valid(headers: dict, event: dict) -> bool:
    if not config.PAYPAL_WEBHOOK_ID:
        return False
    async with httpx.AsyncClient(base_url=config.PAYPAL_BASE, timeout=20) as c:
        token = await _paypal_token(c)
        res = await c.post("/v1/notifications/verify-webhook-signature", headers={"Authorization": f"Bearer {token}"}, json={
            "auth_algo": headers.get("paypal-auth-algo"),
            "cert_url": headers.get("paypal-cert-url"),
            "transmission_id": headers.get("paypal-transmission-id"),
            "transmission_sig": headers.get("paypal-transmission-sig"),
            "transmission_time": headers.get("paypal-transmission-time"),
            "webhook_id": config.PAYPAL_WEBHOOK_ID,
            "webhook_event": event,
        })
    return res.status_code == 200 and res.json().get("verification_status") == "SUCCESS"


# ── Registry ───────────────────────────────────────────────────────────────

# Providers named in rails.json without an adapter yet (wise, dlocal, stripe, payoneer, circle)
# are never claimed, so those payouts wait in the queue until an adapter and keys exist.
SENDERS = {
    "flutterwave": (flutterwave_send, lambda: bool(config.FLW_SECRET_KEY)),
    "paystack": (paystack_send, lambda: bool(config.PAYSTACK_SECRET_KEY)),
    "mpesa": (mpesa_send, lambda: all([config.MPESA_CONSUMER_KEY, config.MPESA_CONSUMER_SECRET, config.MPESA_SHORTCODE,
                                       config.MPESA_INITIATOR, config.MPESA_SECURITY_CREDENTIAL, config.MPESA_CALLBACK_TOKEN])),
    "paypal": (paypal_send, lambda: bool(config.PAYPAL_CLIENT_ID and config.PAYPAL_SECRET)),
}


def live_providers() -> list[str]:
    return [name for name, (_, ready) in SENDERS.items() if ready()]
