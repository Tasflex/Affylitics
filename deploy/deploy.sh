#!/usr/bin/env bash
# Pull the latest main, build all three services and restart them. Run on the VPS as root.
set -euo pipefail
ROOT=/var/www/affylitics
cd "$ROOT"

git pull --ff-only

echo "→ Rust API"
(cd services/api && cargo build --release --locked)

echo "→ Python intel"
(cd services/intel && [ -d .venv ] || python3 -m venv .venv; .venv/bin/pip install -q -r requirements.txt)

echo "→ Next.js web"
set -a; . "$ROOT/.env"; set +a
(cd apps/web && npm ci --no-audit --no-fund && npm run build)

pm2 startOrReload deploy/ecosystem.config.js --update-env
pm2 save
echo "✓ deployed $(git rev-parse --short HEAD)"
