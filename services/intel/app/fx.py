"""USD → local currency quotes, cached for an hour."""

import time

import httpx

from . import config

_cache: dict = {"at": 0.0, "rates": {}}
TTL_SECONDS = 3600


async def rates() -> dict[str, float]:
    if time.time() - _cache["at"] < TTL_SECONDS and _cache["rates"]:
        return _cache["rates"]
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(config.FX_URL)
        res.raise_for_status()
        data = res.json()
    _cache.update(at=time.time(), rates=data["rates"])
    return _cache["rates"]


async def quote(usd_cents: int, currency: str) -> tuple[float, float]:
    """Returns (local_amount, rate). Amounts are rounded to 2 decimals; zero-decimal
    currencies are rounded by the provider adapter."""
    if currency == "USD":
        return round(usd_cents / 100, 2), 1.0
    rate = (await rates()).get(currency)
    if not rate:
        raise LookupError(f"no FX rate for {currency}")
    return round(usd_cents / 100 * rate, 2), rate
