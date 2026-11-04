"""Collecting advertiser escrow. Flutterwave Checkout takes cards, mobile money and bank
payments across Africa (and cards globally); Stripe Checkout is used elsewhere when configured."""

import hashlib
import hmac
import secrets
import time

import httpx

from . import config, rails


def pick_provider(country: str) -> str:
    if config.STRIPE_SECRET_KEY and rails.region_of(country) != "Africa":
        return "stripe"
    if config.FLW_SECRET_KEY:
        return "flutterwave"
    if config.STRIPE_SECRET_KEY:
        return "stripe"
    raise RuntimeError("no payment collection provider configured")


async def start(user_id: str, email: str, name: str, country: str, amount_cents: int, return_url: str) -> dict:
    provider = pick_provider(country)
    ref = f"fund_{user_id}_{secrets.token_hex(6)}"
    if provider == "flutterwave":
        async with httpx.AsyncClient(timeout=20) as c:
            res = await c.post(
                "https://api.flutterwave.com/v3/payments",
                headers={"Authorization": f"Bearer {config.FLW_SECRET_KEY}"},
                json={
                    "tx_ref": ref,
                    "amount": f"{amount_cents / 100:.2f}",
                    "currency": "USD",
                    "redirect_url": return_url,
                    "customer": {"email": email, "name": name},
                    "customizations": {"title": "NetAffil escrow top-up"},
                    "meta": {"user_id": user_id},
                },
            )
            res.raise_for_status()
            return {"provider": provider, "url": res.json()["data"]["link"]}

    async with httpx.AsyncClient(timeout=20) as c:
        res = await c.post(
            "https://api.stripe.com/v1/checkout/sessions",
            auth=(config.STRIPE_SECRET_KEY, ""),
            data={
                "mode": "payment",
                "success_url": return_url,
                "cancel_url": return_url.replace("funded=1", "funded=0"),
                "customer_email": email,
                "client_reference_id": ref,
                "metadata[user_id]": user_id,
                "line_items[0][quantity]": "1",
                "line_items[0][price_data][currency]": "usd",
                "line_items[0][price_data][unit_amount]": str(amount_cents),
                "line_items[0][price_data][product_data][name]": "NetAffil escrow top-up",
            },
        )
        res.raise_for_status()
        return {"provider": provider, "url": res.json()["url"]}


async def flutterwave_verify(transaction_id: int) -> dict | None:
    """Re-fetches a transaction from Flutterwave; webhook bodies are never trusted for amounts."""
    async with httpx.AsyncClient(timeout=20) as c:
        res = await c.get(f"https://api.flutterwave.com/v3/transactions/{transaction_id}/verify",
                          headers={"Authorization": f"Bearer {config.FLW_SECRET_KEY}"})
        if res.status_code != 200:
            return None
        data = res.json().get("data") or {}
    if data.get("status") != "successful" or data.get("currency") != "USD":
        return None
    tx_ref = data.get("tx_ref", "")
    parts = tx_ref.split("_")
    if len(parts) != 3 or parts[0] != "fund":
        return None
    return {"user_id": parts[1], "amount_cents": round(float(data["amount"]) * 100), "reference": f"flw:{data['id']}"}


def stripe_signature_valid(raw: bytes, header: str, tolerance: int = 300) -> bool:
    if not config.STRIPE_WEBHOOK_SECRET or not header:
        return False
    items = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    ts, sig = items.get("t"), items.get("v1")
    if not ts or not sig or abs(time.time() - int(ts)) > tolerance:
        return False
    expected = hmac.new(config.STRIPE_WEBHOOK_SECRET.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)
