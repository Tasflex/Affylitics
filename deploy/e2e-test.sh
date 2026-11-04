#!/usr/bin/env bash
# End-to-end test against a throwaway database; drops it afterwards.
set -uo pipefail
cd /var/www/affylitics
set -a; . ./.env; set +a
BASE_DB="$DATABASE_URL"
TEST_DB="${DATABASE_URL/\/defaultdb?/\/affylitics_e2e?}"
psql "$BASE_DB" -qc "DROP DATABASE IF EXISTS affylitics_e2e" -c "CREATE DATABASE affylitics_e2e" || exit 1

DATABASE_URL="$TEST_DB" API_BIND=127.0.0.1:8199 DB_MAX_CONNECTIONS=3 services/api/target/release/affylitics-api > /tmp/e2e-api.log 2>&1 &
APIPID=$!
for i in $(seq 1 40); do curl -sf http://127.0.0.1:8199/api/health >/dev/null && break; sleep 1; done

A=http://127.0.0.1:8199
O="Origin: $PUBLIC_ORIGIN"
J="Content-Type: application/json"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1: expected [$3] got [$2]"; fail=$((fail+1)); fi; }
cookie() { grep -i '^set-cookie: aff_session=' "$1" | sed -E 's/.*aff_session=([^;]+).*/\1/I' | tr -d '\r'; }
field() { python3 -c 'import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))' "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# Advertiser
curl -s -D /tmp/h1 -H "$O" -H "$J" $A/api/auth/signup -d '{"email":"adv@e2e.test","password":"correct horse battery","display_name":"Solar Co","country":"KE","role":"advertiser"}' >/dev/null
ADV=$(cookie /tmp/h1)
check "advertiser signup sets session" "$([ -n "$ADV" ] && echo yes)" "yes"
check "CSRF: request without Origin rejected" "$(code -H "$J" $A/api/auth/signup -d '{}')" "403"

BRAND=$(curl -s -H "$O" -H "$J" -H "Cookie: aff_session=$ADV" $A/api/brands -d '{"name":"Solar Co","website":"https://solar.example"}')
BID=$(echo "$BRAND" | field 'd["id"]'); SECRET=$(echo "$BRAND" | field 'd["postback_secret"]')
OFFER=$(curl -s -H "$O" -H "$J" -H "Cookie: aff_session=$ADV" $A/api/offers -d "{\"brand_id\":\"$BID\",\"title\":\"Solar home kit\",\"description\":\"Kits\",\"category\":\"solar\",\"landing_url\":\"https://solar.example/kit\",\"model\":\"cpa\",\"payout_cents\":500,\"hold_days\":0}")
OID=$(echo "$OFFER" | field 'd["id"]'); SLUG=$(echo "$OFFER" | field 'd["slug"]')
check "unfunded offer cannot go live" "$(code -H "$O" -H "$J" -H "Cookie: aff_session=$ADV" $A/api/offers/$OID/status -d '{"status":"active"}')" "409"

ADVID=$(curl -s -H "Cookie: aff_session=$ADV" $A/api/me | field 'd["id"]')
CREDIT="{\"user_id\":\"$ADVID\",\"amount_cents\":5000,\"reference\":\"test-1\"}"
curl -s -H "Authorization: Bearer $INTERNAL_TOKEN" -H "$J" $A/internal/escrow/credit -d "$CREDIT" >/dev/null
check "escrow credit is idempotent" "$(curl -s -H "Authorization: Bearer $INTERNAL_TOKEN" -H "$J" $A/internal/escrow/credit -d "$CREDIT" | field 'd["status"]')" "duplicate"
check "internal API rejects bad token" "$(code -H 'Authorization: Bearer nope' -H "$J" $A/internal/escrow/credit -d '{}')" "401"
check "funded offer goes live" "$(code -H "$O" -H "$J" -H "Cookie: aff_session=$ADV" $A/api/offers/$OID/status -d '{"status":"active"}')" "200"

# Publisher
curl -s -D /tmp/h2 -H "$O" -H "$J" $A/api/auth/signup -d '{"email":"pub@e2e.test","password":"another long password","display_name":"Wanjiru","country":"KE","role":"publisher"}' >/dev/null
PUB=$(cookie /tmp/h2)
check "sanctioned country blocked at signup" "$(code -H "$O" -H "$J" $A/api/auth/signup -d '{"email":"x@e2e.test","password":"another long password","display_name":"X","country":"KP","role":"publisher"}')" "403"
check "wrong password rejected" "$(code -H "$O" -H "$J" $A/api/auth/login -d '{"email":"pub@e2e.test","password":"wrong password!!"}')" "400"
LINKCODE=$(curl -s -H "$O" -H "$J" -H "Cookie: aff_session=$PUB" $A/api/links -d "{\"offer_slug\":\"$SLUG\"}" | field 'd["code"]')
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -H 'X-Real-IP: 41.90.1.2' -H 'CF-IPCountry: KE' $A/go/$LINKCODE)
CLICK=$(echo "$LOC" | sed -E 's/.*aff_click=([0-9a-f-]+).*/\1/')
check "click redirects to landing page with aff_click" "$(echo "$LOC" | grep -c '^https://solar.example/kit?aff_click=')" "1"

# Signed postback, exactly as documented for advertisers
post() {
  ts=$(date +%s); body="{\"click_id\":\"$CLICK\",\"external_ref\":\"$1\"}"
  sig=$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac "$2" -hex | awk '{print $2}')
  curl -s -H "$J" -H "X-Affylitics-Brand: $BID" -H "X-Affylitics-Timestamp: $ts" -H "X-Affylitics-Signature: $sig" $A/api/postback -d "$body"
}
check "postback with bad signature rejected" "$(post order-1 wrongsecret | field 'd.get("error")')" "sign in required"
check "signed postback records conversion" "$(post order-1 "$SECRET" | field 'd["status"]')" "recorded"
check "duplicate postback ignored" "$(post order-1 "$SECRET" | field 'd["status"]')" "duplicate"

check "publisher pending = 500 cents" "$(curl -s -H "Cookie: aff_session=$PUB" $A/api/me | field 'd["balances"]["pending_cents"]')" "500"
check "advertiser escrow = 5000 - 500 - 20% fee" "$(curl -s -H "Cookie: aff_session=$ADV" $A/api/me | field 'd["balances"]["escrow_cents"]')" "4400"
check "ledger sums to zero overall" "$(psql "$TEST_DB" -tAc 'SELECT SUM(amount_cents) FROM ledger_entries')" "0"
check "DB refuses unbalanced ledger txn" "$(psql "$TEST_DB" -tAc "BEGIN; INSERT INTO ledger_txns(id,kind) VALUES ('00000000-0000-0000-0000-000000000001','hack'); INSERT INTO ledger_entries(txn_id,account_id,amount_cents) SELECT '00000000-0000-0000-0000-000000000001', id, 100 FROM accounts LIMIT 1; COMMIT;" 2>&1 | grep -c unbalanced)" "1"
check "DB refuses editing ledger" "$(psql "$TEST_DB" -tAc 'UPDATE ledger_entries SET amount_cents = 1' 2>&1 | grep -c append-only)" "1"

# Payout method and KYC gate
MID=$(curl -s -H "$O" -H "$J" -H "Cookie: aff_session=$PUB" $A/api/payout-methods -d '{"rail":"mpesa","details":{"phone":"+254712345678"}}' | field 'd["id"]')
check "payout method shows only last 4" "$(curl -s -H "Cookie: aff_session=$PUB" $A/api/payout-methods | field 'd[0]["details_hint"]')" "•••• 5678"
check "phone not stored in plain text" "$(psql "$TEST_DB" -tAc "SELECT position('254712345678' in encode(details_encrypted,'escape')) FROM payout_methods")" "0"
PAYOUT="{\"method_id\":\"$MID\",\"amount_cents\":300,\"idempotency_key\":\"k1\"}"
check "payout blocked before KYC" "$(code -H "$O" -H "$J" -H "Cookie: aff_session=$PUB" $A/api/payouts -d "$PAYOUT")" "403"
psql "$TEST_DB" -qc "UPDATE users SET kyc_tier = 1 WHERE email = 'pub@e2e.test'"
check "payout blocked while earnings are still pending" "$(code -H "$O" -H "$J" -H "Cookie: aff_session=$PUB" $A/api/payouts -d "$PAYOUT")" "409"

# Hold period ends -> available -> payout -> worker reports paid
psql "$TEST_DB" -qc "UPDATE conversions SET matures_at = now() - interval '1 minute'"
kill $APIPID; wait $APIPID 2>/dev/null
DATABASE_URL="$TEST_DB" API_BIND=127.0.0.1:8199 DB_MAX_CONNECTIONS=3 services/api/target/release/affylitics-api >> /tmp/e2e-api.log 2>&1 &
APIPID=$!
for i in $(seq 1 40); do curl -sf $A/api/health >/dev/null && break; sleep 1; done
sleep 2
check "matured earnings become available" "$(curl -s -H "Cookie: aff_session=$PUB" $A/api/me | field 'd["balances"]["available_cents"]')" "500"
PID_=$(curl -s -H "$O" -H "$J" -H "Cookie: aff_session=$PUB" $A/api/payouts -d "$PAYOUT" | field 'd["id"]')
check "payout request is idempotent" "$(curl -s -H "$O" -H "$J" -H "Cookie: aff_session=$PUB" $A/api/payouts -d "$PAYOUT" | field 'd.get("duplicate")')" "True"
CLAIM=$(curl -s -H "Authorization: Bearer $INTERNAL_TOKEN" -H "$J" $A/internal/payouts/claim -d '{"providers":["mpesa"]}')
check "worker gets decrypted phone" "$(echo "$CLAIM" | field 'd[0]["details"]["phone"]')" "+254712345678"
curl -s -H "Authorization: Bearer $INTERNAL_TOKEN" -H "$J" $A/internal/payouts/$PID_/result -d '{"status":"paid","provider_ref":"MPESA123"}' >/dev/null
check "paid payout leaves available = 200" "$(curl -s -H "Cookie: aff_session=$PUB" $A/api/me | field 'd["balances"]["available_cents"]')" "200"
check "ledger still sums to zero" "$(psql "$TEST_DB" -tAc 'SELECT SUM(amount_cents) FROM ledger_entries')" "0"

kill $APIPID 2>/dev/null; wait $APIPID 2>/dev/null
psql "$BASE_DB" -qc "DROP DATABASE affylitics_e2e" && echo "test database dropped"
echo "RESULT: $pass passed, $fail failed"
