#!/usr/bin/env bash
# One-time setup on the Ubuntu 24.04 VPS (shared with theloadcalc). Touches nothing of theloadcalc:
# its own directory, its own PM2 processes, its own nginx file, ports 3100/8100/8200.
set -euo pipefail

apt-get update -qq
apt-get install -y -qq build-essential pkg-config python3-venv git

# Rust toolchain for the API build
if ! command -v cargo >/dev/null; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi

mkdir -p /var/www
[ -d /var/www/affylitics ] || git clone https://github.com/Tasflex/Affylitics.git /var/www/affylitics
[ -f /var/www/affylitics/.env ] || { cp /var/www/affylitics/.env.example /var/www/affylitics/.env; chmod 600 /var/www/affylitics/.env; }

echo "Next: fill in /var/www/affylitics/.env, install the Cloudflare origin certificate in /etc/ssl/affylitics/,"
echo "link deploy/nginx/affylitics.conf into /etc/nginx/sites-enabled, nginx -t && systemctl reload nginx,"
echo "then run deploy/deploy.sh"
