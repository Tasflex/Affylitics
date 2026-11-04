"""Intel service: internal endpoints for the Rust API, and provider webhooks.

nginx exposes only /hooks/* publicly (mapped to /webhooks/* here); everything else listens on
localhost and requires the INTERNAL_TOKEN."""

import hmac
import json
import logging

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel

from . import api_client, config, funding, fx, kyc, payouts, rails

log = logging.getLogger("intel")
app = FastAPI(title="Affylitics intel", docs_url=None, redoc_url=None, openapi_url=None)


def internal(authorization: str = Header(default="")) -> None:
    token = authorization.removeprefix("Bearer ")
    if not config.INTERNAL_TOKEN or not hmac.compare_digest(token, config.INTERNAL_TOKEN):
        raise HTTPException(401, "unauthorized")


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "payout_providers": payouts.live_providers()}


@app.get("/rails/{country}")
async def country_rails(country: str) -> dict:
    found = rails.for_country(country.upper())
    if not found:
        raise HTTPException(404, "not available")
    return found


@app.get("/fx/{currency}", dependencies=[Depends(internal)])
async def fx_quote(currency: str, usd_cents: int = 10000) -> dict:
    amount, rate = await fx.quote(usd_cents, currency.upper())
    return {"currency": currency.upper(), "amount": amount, "rate": rate}


class KycStart(BaseModel):
    check_id: str
    user_id: str
    country: str
    tier: int
    email: str
    role: str


@app.post("/kyc/start", dependencies=[Depends(internal)])
async def kyc_start(body: KycStart) -> dict:
    try:
        return await kyc.start(body.check_id, body.user_id, body.country, body.tier, body.email)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


class FundStart(BaseModel):
    user_id: str
    email: str
    name: str
    country: str
    amount_cents: int
    return_url: str


@app.post("/funding/start", dependencies=[Depends(internal)])
async def funding_start(body: FundStart) -> dict:
    try:
        return await funding.start(body.user_id, body.email, body.name, body.country, body.amount_cents, body.return_url)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


# ── Webhooks ───────────────────────────────────────────────────────────────

@app.post("/webhooks/kyc/smileid")
async def smileid_webhook(request: Request) -> dict:
    payload = await request.json()
    if not kyc.smile_signature_valid(payload.get("timestamp", ""), payload.get("signature", "")):
        raise HTTPException(401, "bad signature")
    check_id = (payload.get("PartnerParams") or {}).get("check_id")
    if not check_id:
        raise HTTPException(400, "missing check id")
    status, reason = kyc.smileid_outcome(payload)
    await api_client.kyc_result(check_id, status, reason)
    return {"ok": True}


@app.post("/webhooks/kyc/sumsub")
async def sumsub_webhook(request: Request) -> dict:
    raw = await request.body()
    if not kyc.sumsub_digest_valid(raw, request.headers.get("x-payload-digest", ""), request.headers.get("x-payload-digest-alg", "")):
        raise HTTPException(401, "bad signature")
    payload = json.loads(raw)
    outcome = kyc.sumsub_outcome(payload)
    if outcome and payload.get("externalUserId"):
        await api_client.kyc_result(payload["externalUserId"], *outcome)
    return {"ok": True}


@app.post("/webhooks/kyc/simulated/{check_id}")
async def simulated_kyc(check_id: str) -> dict:
    """Development only: lets the dashboard approve a simulated check. 404 in production."""
    if not config.KYC_SIMULATE:
        raise HTTPException(404)
    await api_client.kyc_result(check_id, "approved")
    return {"ok": True}


@app.post("/webhooks/flutterwave")
async def flutterwave_webhook(request: Request) -> dict:
    """Flutterwave sends both collections (escrow top-ups) and transfer results here."""
    if not config.FLW_WEBHOOK_HASH or not hmac.compare_digest(request.headers.get("verif-hash", ""), config.FLW_WEBHOOK_HASH):
        raise HTTPException(401, "bad signature")
    event = await request.json()
    data = event.get("data") or {}
    kind = event.get("event") or event.get("event.type", "")
    if kind == "charge.completed":
        verified = await funding.flutterwave_verify(int(data.get("id", 0)))
        if verified:
            await api_client.escrow_credit(**verified)
    elif kind.startswith("transfer") or "Transfer" in kind:
        status = (data.get("status") or "").upper()
        if status in {"SUCCESSFUL", "FAILED"}:
            await _finish(data.get("reference"), "paid" if status == "SUCCESSFUL" else "failed",
                          str(data.get("id")), data.get("complete_message"))
    return {"ok": True}


@app.post("/webhooks/paystack")
async def paystack_webhook(request: Request) -> dict:
    raw = await request.body()
    if not payouts.paystack_signature_valid(raw, request.headers.get("x-paystack-signature", "")):
        raise HTTPException(401, "bad signature")
    event = json.loads(raw)
    data = event.get("data") or {}
    if event.get("event") == "transfer.success":
        await _finish(data.get("reference"), "paid", data.get("transfer_code"))
    elif event.get("event") in {"transfer.failed", "transfer.reversed"}:
        await _finish(data.get("reference"), "failed", data.get("transfer_code"), data.get("reason") or event["event"])
    return {"ok": True}


@app.post("/webhooks/payouts/mpesa/{token}")
async def mpesa_webhook(token: str, request: Request) -> dict:
    if not config.MPESA_CALLBACK_TOKEN or not hmac.compare_digest(token, config.MPESA_CALLBACK_TOKEN):
        raise HTTPException(404)
    result = (await request.json()).get("Result") or {}
    payout_id = result.get("OriginatorConversationID")
    ok = result.get("ResultCode") == 0
    await _finish(payout_id, "paid" if ok else "failed", result.get("TransactionID"), None if ok else result.get("ResultDesc"))
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@app.post("/webhooks/paypal")
async def paypal_webhook(request: Request) -> dict:
    event = await request.json()
    if not await payouts.paypal_webhook_valid(dict(request.headers), event):
        raise HTTPException(401, "bad signature")
    kind = event.get("event_type", "")
    resource = event.get("resource") or {}
    payout_id = resource.get("payout_item", {}).get("sender_item_id")
    if kind == "PAYMENT.PAYOUTS-ITEM.SUCCEEDED":
        await _finish(payout_id, "paid", resource.get("payout_item_id"))
    elif kind in {"PAYMENT.PAYOUTS-ITEM.FAILED", "PAYMENT.PAYOUTS-ITEM.RETURNED", "PAYMENT.PAYOUTS-ITEM.REFUNDED",
                  "PAYMENT.PAYOUTS-ITEM.BLOCKED", "PAYMENT.PAYOUTS-ITEM.DENIED"}:
        await _finish(payout_id, "failed", resource.get("payout_item_id"), kind.rsplit(".", 1)[-1].lower())
    return {"ok": True}


@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request) -> dict:
    raw = await request.body()
    if not funding.stripe_signature_valid(raw, request.headers.get("stripe-signature", "")):
        raise HTTPException(401, "bad signature")
    event = json.loads(raw)
    obj = event.get("data", {}).get("object", {})
    if event.get("type") == "checkout.session.completed" and obj.get("payment_status") == "paid" and obj.get("currency") == "usd":
        await api_client.escrow_credit(obj["metadata"]["user_id"], int(obj["amount_total"]), f"stripe:{obj['id']}")
    return {"ok": True}


async def _finish(payout_id: str | None, status: str, provider_ref: str | None, reason: str | None = None) -> None:
    if not payout_id:
        return
    try:
        await api_client.payout_result(payout_id, status, provider_ref=provider_ref, failure_reason=reason)
    except Exception:
        # 409 means already finished (providers retry webhooks); anything else is logged for review.
        log.exception("could not record payout %s as %s", payout_id, status)
