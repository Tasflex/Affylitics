"""Background worker: sends queued payouts and scores new clicks.

Run with `python -m app.worker`."""

import asyncio
import logging

from . import api_client, fraud, fx, payouts

log = logging.getLogger("worker")


async def send_payouts() -> None:
    providers = payouts.live_providers()
    if not providers:
        return
    for p in await api_client.claim_payouts(providers):
        net_cents = p["amount_cents"] - p["fee_cents"]
        currency = "USD" if p["provider"] == "paypal" else p["currency"]
        try:
            amount, rate = await fx.quote(net_cents, currency)
            send, _ = payouts.SENDERS[p["provider"]]
            ref = await send(p, amount, currency)
        except payouts.Rejected as e:
            log.warning("payout %s rejected: %s", p["id"], e)
            await api_client.payout_result(p["id"], "failed", failure_reason=str(e))
            continue
        except LookupError as e:
            # No FX rate: nothing was sent, so it is safe to fail and refund the balance.
            await api_client.payout_result(p["id"], "failed", failure_reason=str(e))
            continue
        except Exception:
            # Ambiguous: the provider may or may not have accepted it. Leave it processing for
            # reconciliation against the provider dashboard instead of risking a double payment.
            log.exception("payout %s needs reconciliation", p["id"])
            continue
        await api_client.payout_result(p["id"], "submitted", provider_ref=ref, local_currency=currency,
                                       local_amount=float(payouts.local_amount_str(amount, currency)), fx_rate=rate)
        log.info("payout %s submitted via %s (%s)", p["id"], p["provider"], ref)


async def score_clicks() -> None:
    clicks = await api_client.unscored_clicks()
    if clicks:
        await api_client.click_scores(fraud.score_batch(clicks))


async def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    log.info("worker started; live payout providers: %s", payouts.live_providers() or "none")
    while True:
        for job in (send_payouts, score_clicks):
            try:
                await job()
            except Exception:
                log.exception("%s failed", job.__name__)
        await asyncio.sleep(30)


if __name__ == "__main__":
    asyncio.run(run())
