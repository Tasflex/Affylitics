# Affylitics Network

An affiliate network open to every country we can legally pay. Advertisers pre-fund escrow,
publishers earn from day one and withdraw through local rails: M-Pesa, mobile money, UPI, PIX,
SEPA, ACH, PayPal, Payoneer, USDC.

| Part | Stack | Port |
|---|---|---|
| `apps/web` | Next.js 15, React 19, TypeScript | 3100 |
| `services/api` | Rust, axum, sqlx | 8100 |
| `services/intel` | Python, FastAPI (+ payout worker) | 8200 |
| Database | Aiven PostgreSQL 16 | — |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and [docs/RUNBOOK.md](docs/RUNBOOK.md) to run it.

## Local development

```bash
cp .env.example .env            # set DATABASE_URL, secrets, COOKIE_SECURE=false, PUBLIC_ORIGIN=http://localhost:3100, KYC_SIMULATE=1, APP_ENV=development

cd services/api && cargo run                      # applies DB migrations on start
cd services/intel && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8200        # and: .venv/bin/python -m app.worker
cd apps/web && npm install && npm run dev         # http://localhost:3100
```

## Tests

```bash
cd services/api && cargo test
cd services/intel && .venv/bin/python -m pytest
cd apps/web && npm run typecheck
```
