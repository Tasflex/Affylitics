#!/usr/bin/env bash
# Grant or revoke NetAffil staff access. Run on the VPS:
#   bash deploy/make-admin.sh someone@example.com          # grant
#   bash deploy/make-admin.sh someone@example.com --revoke # revoke
set -euo pipefail
cd /var/www/affylitics
EMAIL="${1:?usage: make-admin.sh EMAIL [--revoke]}"
VALUE=true
[ "${2:-}" = "--revoke" ] && VALUE=false
DB=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
psql "$DB" -v ON_ERROR_STOP=1 -v email="$EMAIL" -v value="$VALUE" -tA <<'SQL'
UPDATE users SET is_admin = :'value'::boolean WHERE email = :'email' RETURNING email || ' is_admin=' || is_admin;
INSERT INTO audit_log (actor_id, action, target, meta)
  SELECT NULL, 'admin.grant', id::text, jsonb_build_object('is_admin', :'value'::boolean, 'via', 'make-admin.sh') FROM users WHERE email = :'email';
SQL
