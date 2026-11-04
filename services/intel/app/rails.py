"""Reads packages/shared/rails.json. Mirrors services/api/src/rails.rs."""

import json
from functools import lru_cache

from . import config

SEPA_CURRENCY = {"PL": "PLN", "CZ": "CZK", "HU": "HUF", "RO": "RON", "BG": "BGN", "SE": "SEK",
                 "DK": "DKK", "NO": "NOK", "IS": "ISK", "CH": "CHF"}


@lru_cache(maxsize=1)
def registry() -> dict:
    return json.loads(config.RAILS_PATH.read_text(encoding="utf-8"))


def region_of(country: str) -> str | None:
    for region, codes in registry()["regions"].items():
        if country in codes:
            return region
    return None


def for_country(country: str) -> dict | None:
    """Currency and rails for a country, or None when sanctions law bars paying it."""
    reg = registry()
    if country in reg["blocked"]:
        return None
    if country in reg["countries"]:
        entry = reg["countries"][country]
        currency, ids, review = entry["currency"], entry["rails"], entry.get("review", False)
    elif country in reg["sepa"]:
        currency, ids, review = SEPA_CURRENCY.get(country, "EUR"), ["sepa", "paypal", "payoneer", "usdc"], False
    else:
        currency, ids, review = "USD", reg["default"]["rails"], False
    return {"country": country, "currency": currency, "review": review,
            "rails": [{"id": i, **reg["rails"][i]} for i in ids if i in reg["rails"]]}
