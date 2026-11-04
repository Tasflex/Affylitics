"""Calls to the Rust API's /internal endpoints."""

import httpx

from . import config


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=config.API_URL + "/internal",
        headers={"Authorization": f"Bearer {config.INTERNAL_TOKEN}"},
        timeout=20,
    )


async def _post(path: str, body) -> dict:
    async with _client() as c:
        res = await c.post(path, json=body)
        res.raise_for_status()
        return res.json()


async def claim_payouts(providers: list[str], limit: int = 20) -> list[dict]:
    return await _post("/payouts/claim", {"providers": providers, "limit": limit})


async def payout_result(payout_id: str, status: str, **fields) -> dict:
    return await _post(f"/payouts/{payout_id}/result", {"status": status, **fields})


async def kyc_result(provider_ref: str, status: str, reason: str | None = None) -> dict:
    return await _post("/kyc/result", {"provider_ref": provider_ref, "status": status, "reason": reason})


async def escrow_credit(user_id: str, amount_cents: int, reference: str) -> dict:
    return await _post("/escrow/credit", {"user_id": user_id, "amount_cents": amount_cents, "reference": reference})


async def unscored_clicks(limit: int = 2000) -> list[dict]:
    async with _client() as c:
        res = await c.get("/clicks/unscored", params={"limit": limit})
        res.raise_for_status()
        return res.json()


async def click_scores(scores: list[dict]) -> dict:
    return await _post("/clicks/scores", scores)
