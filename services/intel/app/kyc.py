"""Identity verification. Smile ID handles African national IDs (checked against the issuing
registry); Sumsub handles everywhere else and business (KYB) checks."""

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone

import httpx

from . import config, rails

# ID types Smile ID can verify against the government registry, per country.
SMILE_ID_TYPES = {
    "KE": "NATIONAL_ID", "NG": "NIN_V2", "GH": "GHANA_CARD", "ZA": "NATIONAL_ID",
    "UG": "NATIONAL_ID_NO_PHOTO", "CI": "NATIONAL_ID", "ZM": "NATIONAL_ID",
}


def pick_provider(country: str, tier: int) -> str:
    if config.KYC_SIMULATE:
        return "simulated"
    smile_ok = bool(config.SMILEID_PARTNER_ID and config.SMILEID_API_KEY)
    if tier < 3 and smile_ok and rails.region_of(country) == "Africa":
        return "smileid"
    if config.SUMSUB_APP_TOKEN and config.SUMSUB_SECRET_KEY:
        return "sumsub"
    if smile_ok:
        return "smileid"
    raise RuntimeError("no KYC provider configured")


# ── Smile ID ───────────────────────────────────────────────────────────────

def smile_signature(timestamp: str) -> str:
    msg = (timestamp + config.SMILEID_PARTNER_ID + "sid_request").encode()
    return base64.b64encode(hmac.new(config.SMILEID_API_KEY.encode(), msg, hashlib.sha256).digest()).decode()


def smile_signature_valid(timestamp: str, signature: str) -> bool:
    return hmac.compare_digest(smile_signature(timestamp), signature or "")


async def smileid_start(check_id: str, user_id: str, country: str, tier: int) -> dict:
    """Creates a single-use Smile Link. Field names follow Smile ID's Smile Links API; confirm
    against your account's docs when going live."""
    ts = datetime.now(timezone.utc).isoformat()
    id_type = SMILE_ID_TYPES.get(country)
    id_types = [{"country": country, "id_type": id_type, "verification_method": "enhanced_kyc" if tier == 1 else "biometric_kyc"}] if id_type \
        else [{"country": country, "verification_method": "doc_verification"}]
    body = {
        "partner_id": config.SMILEID_PARTNER_ID,
        "signature": smile_signature(ts),
        "timestamp": ts,
        "name": f"NetAffil verification level {tier}",
        "company_name": "NetAffil",
        "id_types": id_types,
        "callback_url": f"{config.WEBHOOK_BASE}/kyc/smileid",
        "data_privacy_policy_url": f"{config.PUBLIC_ORIGIN}/legal/privacy",
        "is_single_use": True,
        "user_id": user_id,
        "partner_params": {"check_id": check_id},
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
    }
    async with httpx.AsyncClient(timeout=20) as c:
        res = await c.post(f"{config.SMILEID_BASE}/v1/smile_links", json=body)
        res.raise_for_status()
        data = res.json()
    return {"provider": "smileid", "provider_ref": check_id, "url": data.get("link")}


def smileid_outcome(payload: dict) -> tuple[str, str | None]:
    """Maps a Smile ID callback to (status, reason). Unknown codes stay pending for staff review
    rather than guessing; check the code table in Smile ID's docs before going live."""
    code = str(payload.get("ResultCode", ""))
    text = payload.get("ResultText")
    if code in {"0810", "1012", "0820", "1020", "0830"}:
        return "approved", None
    if code in {"0812", "1013", "0822", "1022", "0832"}:
        return "rejected", text
    return "pending", text


# ── Sumsub ─────────────────────────────────────────────────────────────────

SUMSUB_BASE = "https://api.sumsub.com"


def sumsub_headers(method: str, path: str, body: bytes = b"") -> dict:
    ts = str(int(time.time()))
    sig = hmac.new(config.SUMSUB_SECRET_KEY.encode(), ts.encode() + method.encode() + path.encode() + body, hashlib.sha256).hexdigest()
    return {"X-App-Token": config.SUMSUB_APP_TOKEN, "X-App-Access-Ts": ts, "X-App-Access-Sig": sig}


async def sumsub_start(check_id: str, user_id: str, tier: int, email: str) -> dict:
    level = config.SUMSUB_LEVELS[tier]
    # One external user id per check so the webhook maps straight back to it.
    path = f"/resources/sdkIntegrations/levels/{level}/websdkLink?ttlInSecs=172800&externalUserId={check_id}&lang=en"
    body = json.dumps({"applicantIdentifiers": {"email": email}}).encode()
    async with httpx.AsyncClient(timeout=20) as c:
        res = await c.post(SUMSUB_BASE + path, content=body,
                           headers={**sumsub_headers("POST", path, body), "Content-Type": "application/json"})
        res.raise_for_status()
        data = res.json()
    return {"provider": "sumsub", "provider_ref": check_id, "url": data.get("url")}


def sumsub_digest_valid(raw: bytes, digest: str, alg: str) -> bool:
    algos = {"HMAC_SHA256_HEX": hashlib.sha256, "HMAC_SHA512_HEX": hashlib.sha512, "HMAC_SHA1_HEX": hashlib.sha1}
    fn = algos.get(alg or "HMAC_SHA256_HEX")
    if not fn or not config.SUMSUB_WEBHOOK_SECRET:
        return False
    return hmac.compare_digest(hmac.new(config.SUMSUB_WEBHOOK_SECRET.encode(), raw, fn).hexdigest(), digest or "")


def sumsub_outcome(payload: dict) -> tuple[str, str | None] | None:
    if payload.get("type") != "applicantReviewed":
        return None
    result = payload.get("reviewResult", {})
    if result.get("reviewAnswer") == "GREEN":
        return "approved", None
    return "rejected", result.get("moderationComment") or "verification was not successful"


async def start(check_id: str, user_id: str, country: str, tier: int, email: str) -> dict:
    provider = pick_provider(country, tier)
    if provider == "simulated":
        return {"provider": "simulated", "provider_ref": check_id, "url": f"{config.PUBLIC_ORIGIN}/dashboard/kyc?simulated={check_id}"}
    if provider == "smileid":
        return await smileid_start(check_id, user_id, country, tier)
    return await sumsub_start(check_id, user_id, tier, email)
