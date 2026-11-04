import hashlib
import hmac
import time

import pytest

from app import config, fraud, funding, payouts, rails


def test_kenya_rails_and_blocked():
    ke = rails.for_country("KE")
    assert ke["currency"] == "KES" and ke["rails"][0]["id"] == "mpesa"
    assert rails.for_country("KP") is None
    assert rails.for_country("DE")["currency"] == "EUR"
    assert rails.for_country("FJ")["rails"], "every country gets a fallback rail"


def test_every_country_rail_exists():
    reg = rails.registry()
    for code, entry in reg["countries"].items():
        for rail in entry["rails"]:
            assert rail in reg["rails"], f"{code} uses unknown rail {rail}"


def test_fraud_flags_repeat_clicks():
    base = {"link_id": "L", "publisher_id": "P", "ua_hash": "u", "country": "KE"}
    clicks = [{**base, "id": str(i), "ip_hash": "same"} for i in range(8)] + [{**base, "id": "x", "ip_hash": "other"}]
    scores = {s["id"]: s["score"] for s in fraud.score_batch(clicks)}
    assert scores["0"] > 0.4
    assert scores["x"] == 0.0


def test_kenyan_msisdn():
    assert payouts.kenyan_msisdn("0712 345 678") == "254712345678"
    assert payouts.kenyan_msisdn("+254712345678") == "254712345678"
    with pytest.raises(payouts.Rejected):
        payouts.kenyan_msisdn("12345")


def test_zero_decimal_amounts():
    assert payouts.local_amount_str(1290.6, "KES") == "1291"
    assert payouts.local_amount_str(10.5, "GHS") == "10.50"


def test_stripe_signature(monkeypatch):
    monkeypatch.setattr(config, "STRIPE_WEBHOOK_SECRET", "whsec_test")
    raw = b'{"id":"evt"}'
    ts = str(int(time.time()))
    sig = hmac.new(b"whsec_test", f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    assert funding.stripe_signature_valid(raw, f"t={ts},v1={sig}")
    assert not funding.stripe_signature_valid(raw, f"t={ts},v1={'0' * 64}")
    assert not funding.stripe_signature_valid(raw, f"t={int(ts) - 1000},v1={sig}")


def test_paystack_signature(monkeypatch):
    monkeypatch.setattr(config, "PAYSTACK_SECRET_KEY", "sk_test")
    raw = b'{"event":"transfer.success"}'
    good = hmac.new(b"sk_test", raw, hashlib.sha512).hexdigest()
    assert payouts.paystack_signature_valid(raw, good)
    assert not payouts.paystack_signature_valid(raw, "bad")


def test_no_providers_without_keys(monkeypatch):
    for key in ["FLW_SECRET_KEY", "PAYSTACK_SECRET_KEY", "MPESA_CONSUMER_KEY", "PAYPAL_CLIENT_ID"]:
        monkeypatch.setattr(config, key, "")
    assert payouts.live_providers() == []
